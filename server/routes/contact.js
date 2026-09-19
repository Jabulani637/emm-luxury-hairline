const express = require('express');
const router = express.Router();

const { createDraftOrder } = require('../shopify/admin/mutations/createDraftOrder');
const { getCountries } = require('../shopify/queries/getCountries');
const { saveRecord } = require('../localRecords');

function sanitizeString(str, maxLen = 500) {
  if (typeof str !== 'string') return '';
  return str.trim().slice(0, maxLen).replace(/[\x00-\x1F\x7F]/g, '');
}

function isValidEmail(email) {
  if (typeof email !== 'string') return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

/**
 * Contact enquiries are filed as zero-value draft orders tagged
 * `contact-inquiry` so they land inside Shopify rather than a mailbox.
 * They are hidden from the customer and marked non-shippable so they never
 * look like something that needs fulfilling.
 */
router.post('/', async (req, res) => {
  const body = req.body || {};

  const name = sanitizeString(body.name, 120);
  const email = sanitizeString(body.email, 160);
  const phone = sanitizeString(body.phone, 60);
  const subject = sanitizeString(body.subject, 120) || 'General enquiry';
  const message = sanitizeString(body.message, 4000);

  if (!name || !email || !message) {
    return res.status(400).json({ ok: false, error: 'Name, email and message are all required.' });
  }
  if (!isValidEmail(email)) {
    return res.status(400).json({ ok: false, error: 'Please provide a valid email address.' });
  }
  if (message.length < 5) {
    return res.status(400).json({ ok: false, error: 'Please include a short message so we can help.' });
  }

  const ref = 'ci_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  const record = {
    id: ref,
    createdAt: new Date().toISOString(),
    kind: 'contact-inquiry',
    customer: { name, email, phone: phone || null },
    subject,
    message,
    status: 'new',
    shopifyDraftOrder: null,
    syncError: null,
  };

  saveRecord('contact-inquiries', ref, record);

  let currency = 'GBP';
  try {
    currency = (await getCountries()).shopCurrency || 'GBP';
  } catch (err) {
    console.warn('[contact] Could not resolve shop currency, defaulting to GBP:', err.message);
  }

  try {
    const draftOrder = await createDraftOrder({
      customerName: name,
      customerEmail: email,
      customerPhone: phone || undefined,
      lineItems: [{
        title: `Contact enquiry — ${subject}`,
        quantity: 1,
        originalUnitPrice: '0.00',
        requiresShipping: false,
        taxable: false,
      }],
      note: `${message}\n\n— ${name} (${email}${phone ? ', ' + phone : ''})`,
      tags: ['contact-inquiry', ref],
      currencyCode: currency,
      visibleToCustomer: false,
      sourceName: 'emm-luxury-hairline-contact',
    });

    record.shopifyDraftOrder = { id: draftOrder.id, name: draftOrder.name, status: draftOrder.status };
    record.status = 'synced';
    console.log('[contact] Draft order created for enquiry:', draftOrder.name, '|', subject);
  } catch (err) {
    record.status = 'pending_shopify_sync';
    record.syncError = err.message || String(err);
    console.error('[contact] DRAFT ORDER NOT CREATED — enquiry kept locally only:', ref, '|', record.syncError);
  }

  saveRecord('contact-inquiries', ref, record);

  const synced = Boolean(record.shopifyDraftOrder);

  res.status(201).json({
    ok: true,
    reference: ref,
    syncedToShopify: synced,
    message: synced
      ? 'Thank you! Your message has been received — we will reply shortly.'
      : 'Thank you! We have saved your message and flagged it for our team. We will reply shortly.',
  });
});

module.exports = router;

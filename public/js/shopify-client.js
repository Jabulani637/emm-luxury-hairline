// Minimal client that talks to server backend endpoints
async function fetchProducts() {
  const r = await fetch('/api/products');
  if (!r.ok) throw new Error('Failed to fetch products');
  const data = await r.json();
  return data.data.products.edges.map(e => e.node);
}

function renderProducts(nodes, containerSelector = '#products') {
  const container = document.querySelector(containerSelector);
  if (!container) return;
  container.innerHTML = '';
  nodes.forEach(p => {
	const img = p.images?.edges?.[0]?.node?.url || '';
	const price = p.variants?.edges?.[0]?.node?.priceV2?.amount || '';
	const div = document.createElement('div');
	div.className = 'product-card';
	div.innerHTML = `
	  <img src="${img}" alt="${p.title}" />
	  <h3>${p.title}</h3>
	  <p>${p.description}</p>
	  <div>Price: ${price}</div>
	  <button data-handle="${p.handle}">Buy</button>
	`;
	const btn = div.querySelector('button');
	btn.addEventListener('click', async () => {
	  try {
		// Create a checkout with the first variant of the product
		const variantId = p.variants.edges[0].node.id;
		const resp = await fetch('/api/checkout', {
		  method: 'POST',
		  headers: { 'Content-Type': 'application/json' },
		  body: JSON.stringify({ lineItems: [{ variantId, quantity: 1 }] })
		});
		const json = await resp.json();
		if (json.webUrl) window.location.href = json.webUrl;
	  } catch (err) {
		console.error(err);
		alert('Failed to create checkout');
	  }
	});
	container.appendChild(div);
  });
}

// Auto-load on DOM ready
document.addEventListener('DOMContentLoaded', async () => {
  try {
	const products = await fetchProducts();
	renderProducts(products);
  } catch (err) {
	console.error('shopify client', err);
  }
});

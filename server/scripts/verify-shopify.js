require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { getProducts } = require('../shopify/queries/getProducts');
const { getProduct } = require('../shopify/queries/getProduct');

async function run() {
  try {
	console.log('Using SHOP:', process.env.SHOPIFY_STORE || process.env.SHOPIFY_STORE_DOMAIN || process.env.SHOPIFY_STORE);
	console.log('Testing products query (first: 2)...');
	const products = await getProducts({ first: 2 });
	console.log('Products fetched:', Array.isArray(products) ? products.map(p => ({ handle: p.handle, title: p.title })) : products);

	if (products && products.length > 0) {
	  const handle = products[0].handle;
	  console.log(`Testing product by handle: ${handle}`);
	  const product = await getProduct(handle);
	  if (product) {
		console.log('Product fetched:', { handle: product.handle, title: product.title, variants: (product.variants || []).length });
	  } else {
		console.log('Product fetch returned null');
	  }
	} else {
	  console.log('No products returned from shopify query. Ensure the store has published products and STOREFRONT_TOKEN has proper scope.');
	}

	process.exit(0);
  } catch (err) {
	console.error('Verification failed:', err && err.message ? err.message : err);
	process.exit(2);
  }
}

run();

// Simple test script to check if server is working
const http = require('http');

// Test API health
const options1 = {
  hostname: 'localhost',
  port: 3000,
  path: '/api/health',
  method: 'GET'
};

const req1 = http.request(options1, (res) => {
  console.log('API Health Status:', res.statusCode);
  res.on('data', (d) => {
    console.log('API Health Body:', d.toString());
  });
});

req1.on('error', (error) => {
  console.error('API Health Error:', error.message);
});

req1.end();

// Test homepage
const options2 = {
  hostname: 'localhost',
  port: 3000,
  path: '/',
  method: 'GET'
};

const req2 = http.request(options2, (res) => {
  console.log('Homepage Status:', res.statusCode);
  res.on('data', (d) => {
    console.log('Homepage received, length:', d.length);
  });
});

req2.on('error', (error) => {
  console.error('Homepage Error:', error.message);
});

req2.end();

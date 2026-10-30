const catalogApiUrl = (process.env.CATALOG_API_URL || 'http://localhost:5001').replace(/\/+$/, '');

function catalogError(statusCode, message) {
  return Object.assign(new Error(message), { statusCode });
}

export async function getCatalogProducts(productIds) {
  if (!productIds.length) return [];

  let response;
  try {
    const query = new URLSearchParams({ ids: productIds.join(',') });
    response = await fetch(`${catalogApiUrl}/api/catalog/products?${query}`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(8000)
    });
  } catch {
    throw catalogError(502, 'The product catalog is unavailable. Please try again.');
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw catalogError(response.status === 404 ? 404 : 502, result.message || 'Could not verify this product with the catalog.');
  }
  if (!Array.isArray(result.products)) {
    throw catalogError(502, 'The product catalog returned an invalid response.');
  }
  return result.products;
}

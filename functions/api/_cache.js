export async function warmUpGenericCache(env, query, cacheKey, etagPrefix) {
    const { results } = await env.DB.prepare(query).all();
    const jsonString = JSON.stringify(results);
    const etag = '"' + etagPrefix + '-' + Date.now().toString(36) + '"';
    await env.KV_CACHE.put(cacheKey, jsonString, { metadata: { etag } });
    return { jsonString, etag };
}

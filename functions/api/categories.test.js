import { test } from 'node:test';
import assert from 'node:assert';
import { onRequestGet, onRequestPost, onRequestPut, onRequestDelete } from './categories.js';

function createMockEnv(dbResults = []) {
    const mockDB = {
        queries: [],
        batches: [],
        prepare: (query) => {
            return {
                query,
                args: [],
                bind: function(...args) {
                    this.args = args;
                    return this;
                },
                all: async function() {
                    mockDB.queries.push({ query: this.query, args: this.args });
                    return { results: dbResults };
                },
                run: async function() {
                    mockDB.queries.push({ query: this.query, args: this.args });
                    return { success: true };
                }
            };
        },
        batch: async (statements) => {
            mockDB.batches.push(statements);
            return [{ success: true }];
        }
    };

    const mockKV = {
        store: new Map(),
        metadataStore: new Map(),
        puts: [],
        getWithMetadata: async (key) => {
            return {
                value: mockKV.store.get(key) || null,
                metadata: mockKV.metadataStore.get(key) || null
            };
        },
        put: async (key, value, options) => {
            mockKV.store.set(key, value);
            if (options && options.metadata) {
                mockKV.metadataStore.set(key, options.metadata);
            }
            mockKV.puts.push({ key, value, options });
        }
    };

    return {
        DB: mockDB,
        KV_CACHE: mockKV
    };
}

function createContext(env, requestOptions = {}) {
    return {
        env,
        request: {
            headers: new Map(Object.entries(requestOptions.headers || {})),
            json: async () => requestOptions.json || {}
        }
    };
}

test('onRequestGet - cache miss', async () => {
    const mockCategories = [{ id: 1, name: 'Test Category', sort_order: 0 }];
    const env = createMockEnv(mockCategories);
    const context = createContext(env);

    const response = await onRequestGet(context);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("Content-Type"), "application/json");

    const body = await response.json();
    assert.deepStrictEqual(body, mockCategories);

    // Verify DB query was executed
    assert.strictEqual(env.DB.queries.length, 1);
    assert.strictEqual(env.DB.queries[0].query, "SELECT * FROM categories ORDER BY sort_order ASC, id ASC");

    // Verify KV cache was updated
    assert.strictEqual(env.KV_CACHE.puts.length, 1);
    assert.strictEqual(env.KV_CACHE.puts[0].key, "all_categories_data");
    assert.strictEqual(env.KV_CACHE.puts[0].value, JSON.stringify(mockCategories));
    assert.ok(env.KV_CACHE.puts[0].options.metadata.etag.startsWith('"cat-'));

    // Verify response ETag matches cache
    assert.strictEqual(response.headers.get("ETag"), env.KV_CACHE.puts[0].options.metadata.etag);
});

test('onRequestGet - cache hit', async () => {
    const env = createMockEnv();
    const cachedData = JSON.stringify([{ id: 2, name: 'Cached Category' }]);
    const etag = '"cat-mocked123"';

    env.KV_CACHE.store.set("all_categories_data", cachedData);
    env.KV_CACHE.metadataStore.set("all_categories_data", { etag });

    const context = createContext(env);
    const response = await onRequestGet(context);

    assert.strictEqual(response.status, 200);
    assert.strictEqual(response.headers.get("ETag"), etag);

    const body = await response.text();
    assert.strictEqual(body, cachedData);

    // DB shouldn't be queried
    assert.strictEqual(env.DB.queries.length, 0);
});

test('onRequestGet - ETag 304 match', async () => {
    const env = createMockEnv();
    const cachedData = JSON.stringify([{ id: 3, name: 'ETag Category' }]);
    const etag = '"cat-etagmatch"';

    env.KV_CACHE.store.set("all_categories_data", cachedData);
    env.KV_CACHE.metadataStore.set("all_categories_data", { etag });

    const context = createContext(env, {
        headers: { "if-none-match": etag }
    });

    // We need to patch context.request.headers to simulate the get method
    context.request.headers.get = (name) => {
        if (name.toLowerCase() === 'if-none-match') return etag;
        return null;
    };

    const response = await onRequestGet(context);

    assert.strictEqual(response.status, 304);
    assert.strictEqual(response.headers.get("ETag"), etag);

    const body = await response.text();
    assert.strictEqual(body, '');

    assert.strictEqual(env.DB.queries.length, 0);
});

test('onRequestPost - creation and cache warmup', async () => {
    const mockCategories = [{ id: 1, name: 'New Category', sort_order: 0 }];
    const env = createMockEnv(mockCategories); // will return this on warmUpCatCache
    const context = createContext(env, {
        json: { name: 'New Category' }
    });

    const response = await onRequestPost(context);
    const body = await response.json();

    assert.strictEqual(body.success, true);

    // Verify DB insert query
    assert.strictEqual(env.DB.queries.length, 2); // 1 for INSERT, 1 for SELECT in warmUp
    assert.strictEqual(env.DB.queries[0].query, "INSERT INTO categories (name) VALUES (?)");
    assert.deepStrictEqual(env.DB.queries[0].args, ['New Category']);

    // Verify cache was warmed up
    assert.strictEqual(env.KV_CACHE.puts.length, 1);
    assert.strictEqual(env.KV_CACHE.puts[0].value, JSON.stringify(mockCategories));
});

test('onRequestPut - single update and cache warmup', async () => {
    const mockCategories = [{ id: 1, name: 'Updated Category', sort_order: 0 }];
    const env = createMockEnv(mockCategories);
    const context = createContext(env, {
        json: { id: 1, name: 'Updated Category' }
    });

    const response = await onRequestPut(context);
    const body = await response.json();

    assert.strictEqual(body.success, true);

    assert.strictEqual(env.DB.queries.length, 2); // 1 for UPDATE, 1 for SELECT
    assert.strictEqual(env.DB.queries[0].query, "UPDATE categories SET name = ? WHERE id = ?");
    assert.deepStrictEqual(env.DB.queries[0].args, ['Updated Category', 1]);

    assert.strictEqual(env.KV_CACHE.puts.length, 1);
    assert.strictEqual(env.KV_CACHE.puts[0].value, JSON.stringify(mockCategories));
});

test('onRequestPut - batch update and cache warmup', async () => {
    const mockCategories = [
        { id: 2, name: 'Cat 2', sort_order: 0 },
        { id: 1, name: 'Cat 1', sort_order: 1 }
    ];
    const env = createMockEnv(mockCategories);
    const context = createContext(env, {
        json: [
            { id: 2 }, // index 0
            { id: 1 }  // index 1
        ]
    });

    const response = await onRequestPut(context);
    const body = await response.json();

    assert.strictEqual(body.success, true);

    assert.strictEqual(env.DB.batches.length, 1);
    const batchStmts = env.DB.batches[0];
    assert.strictEqual(batchStmts.length, 2);

    assert.strictEqual(batchStmts[0].query, "UPDATE categories SET sort_order = ? WHERE id = ?");
    assert.deepStrictEqual(batchStmts[0].args, [0, 2]);
    assert.deepStrictEqual(batchStmts[1].args, [1, 1]);

    // warmUpCatCache calls DB.prepare().all()
    assert.strictEqual(env.DB.queries.length, 1);

    assert.strictEqual(env.KV_CACHE.puts.length, 1);
    assert.strictEqual(env.KV_CACHE.puts[0].value, JSON.stringify(mockCategories));
});

test('onRequestDelete - deletion and cache warmup', async () => {
    const mockCategories = [];
    const env = createMockEnv(mockCategories);
    const context = createContext(env, {
        json: { id: 1 }
    });

    const response = await onRequestDelete(context);
    const body = await response.json();

    assert.strictEqual(body.success, true);

    assert.strictEqual(env.DB.queries.length, 2); // 1 for DELETE, 1 for SELECT
    assert.strictEqual(env.DB.queries[0].query, "DELETE FROM categories WHERE id = ?");
    assert.deepStrictEqual(env.DB.queries[0].args, [1]);

    assert.strictEqual(env.KV_CACHE.puts.length, 1);
    assert.strictEqual(env.KV_CACHE.puts[0].value, JSON.stringify(mockCategories));
});

import { test } from 'node:test';
import assert from 'node:assert';
import { onRequest } from './search.js';

test('search API - missing query', async () => {
    const context = {
        request: {
            url: 'http://localhost/api/search'
        }
    };

    const response = await onRequest(context);
    assert.strictEqual(response.status, 400);
    const text = await response.text();
    assert.strictEqual(text, '缺少搜索词');
});

test('search API - successful search with results', async () => {
    const context = {
        request: {
            url: 'http://localhost/api/search?q=test'
        },
        env: {
            AI: {
                run: async (model, input) => {
                    return { data: [[0.1, 0.2, 0.3]] }; // mock vector
                }
            },
            VECTOR_INDEX: {
                query: async (vector, options) => {
                    return {
                        matches: [{ id: '1' }, { id: '2' }]
                    };
                }
            },
            DB: {
                prepare: (stmt) => {
                    return {
                        bind: (...args) => {
                            return {
                                all: async () => {
                                    return {
                                        results: [{ id: '1', name: 'Site 1' }, { id: '2', name: 'Site 2' }]
                                    };
                                }
                            };
                        }
                    };
                }
            }
        }
    };

    const response = await onRequest(context);
    assert.strictEqual(response.status, 200);
    const json = await response.json();
    assert.deepStrictEqual(json, [{ id: '1', name: 'Site 1' }, { id: '2', name: 'Site 2' }]);
    assert.strictEqual(response.headers.get('content-type'), 'application/json;charset=UTF-8');
});

test('search API - successful search with no results', async () => {
    const context = {
        request: {
            url: 'http://localhost/api/search?q=noresults'
        },
        env: {
            AI: {
                run: async () => ({ data: [[0.1, 0.2, 0.3]] })
            },
            VECTOR_INDEX: {
                query: async () => ({ matches: [] })
            }
        }
    };

    const response = await onRequest(context);
    assert.strictEqual(response.status, 200);
    const json = await response.json();
    assert.deepStrictEqual(json, []);
    assert.strictEqual(response.headers.get('content-type'), 'application/json;charset=UTF-8');
});

test('search API - error handling', async () => {
    const context = {
        request: {
            url: 'http://localhost/api/search?q=error'
        },
        env: {
            AI: {
                run: async () => {
                    throw new Error("AI service down");
                }
            }
        }
    };

    const response = await onRequest(context);
    assert.strictEqual(response.status, 500);
    const text = await response.text();
    assert.strictEqual(text, 'Search Error');
});

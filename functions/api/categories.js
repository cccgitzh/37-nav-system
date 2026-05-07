// functions/api/categories.js
// 统一处理分类的 增(POST) 删(DELETE) 改(PUT) 查(GET)

export async function onRequestGet(context) {
    const { results } = await context.env.DB.prepare("SELECT * FROM categories ORDER BY sort_order ASC, id ASC").all();
    return new Response(JSON.stringify(results), { headers: { "content-type": "application/json" } });
}

export async function onRequestPost(context) {
    const { name, sort_order } = await context.request.json();
    await context.env.DB.prepare("INSERT INTO categories (name, sort_order) VALUES (?, ?)").bind(name, sort_order || 0).run();
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestPut(context) {
    const { id, name, sort_order } = await context.request.json();
    await context.env.DB.prepare("UPDATE categories SET name = ?, sort_order = ? WHERE id = ?").bind(name, sort_order || 0, id).run();
    return new Response(JSON.stringify({ success: true }));
}

export async function onRequestDelete(context) {
    const { id } = await context.request.json();
    // 简单的安全策略：删除分类时，该分类下的节点不会被删，只是分类名可能对不上，需前端重新分配
    await context.env.DB.prepare("DELETE FROM categories WHERE id = ?").bind(id).run();
    return new Response(JSON.stringify({ success: true }));
}
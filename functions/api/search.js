// /functions/api/search.js
export async function onRequest(context) {
    try {
        // 获取用户输入的搜索词
        const url = new URL(context.request.url);
        const query = url.searchParams.get('q');

        if (!query) return new Response("缺少搜索词", { status: 400 });

        // 1. 用 AI 把用户的“大白话搜索词”变成“坐标”
        const { data: embeddings } = await context.env.AI.run('@cf/baai/bge-small-en-v1.5', {
            text: [query]
        });
        const vector = embeddings[0];

        // 2. 在 Vectorize 宇宙里，寻找距离这个搜索坐标最近的 6 个节点（最匹配的 6 个网站）
        const vectorResults = await context.env.VECTOR_INDEX.query(vector, { topK: 6 });
        
        // 如果啥也没找到
        if (vectorResults.matches.length === 0) {
            return new Response(JSON.stringify([]), { headers: { "content-type": "application/json;charset=UTF-8" }});
        }

        // 3. 提取出这 6 个节点的 ID
        const matchedIds = vectorResults.matches.map(match => match.id);

        // 4. 去 D1 仓库里，把这几个 ID 对应的精美卡片详细信息拿出来
        const placeholders = matchedIds.map(() => '?').join(',');
        const stmt = `SELECT * FROM links WHERE id IN (${placeholders})`;
        const { results } = await context.env.DB.prepare(stmt).bind(...matchedIds).all();

        // 包装好发送给前台
        return new Response(JSON.stringify(results), {
            headers: { "content-type": "application/json;charset=UTF-8" },
        });

    } catch (error) {
        return new Response("Search Error", { status: 500 });
    }
}
// /functions/api/add.js
export async function onRequestPost(context) {
    try {
        const data = await context.request.json();
        const { title, url, description, category, icon, color_theme } = data;

        if (!title || !url || !category) {
            return new Response("标题、网址和分类不能为空", { status: 400 });
        }

        // 1. 先把数据正常存进 D1 仓库，并获取它自动生成的专属 ID
        const dbResult = await context.env.DB.prepare(
            "INSERT INTO links (title, url, description, category, icon, color_theme) VALUES (?, ?, ?, ?, ?, ?) RETURNING id"
        ).bind(title, url, description, category, icon, color_theme).first();
        
        const newId = dbResult.id;

        // 2. [核心] 唤醒 AI 大脑：把网站的标题和描述送给 AI 分析
        const textToVectorize = `${title} - ${description}`;
        const { data: embeddings } = await context.env.AI.run('@cf/baai/bge-small-en-v1.5', {
            text: [textToVectorize]
        });
        const vector = embeddings[0]; // 提取 AI 计算出的高维坐标

        // 3. 把坐标存入 Vectorize 记忆库，并和刚才的数据库 ID 绑定死
        await context.env.VECTOR_INDEX.upsert([
            { id: newId.toString(), values: vector }
        ]);

        // 4. 清理旧的 KV 缓存，保证首页刷新
        await context.env.KV_CACHE.delete("all_links_data");

        return new Response(JSON.stringify({ success: true, message: "节点接入成功，AI 已完成语义记忆录入" }), {
            headers: { "content-type": "application/json;charset=UTF-8" }
        });

    } catch (error) {
        console.log(error); // 方便在 CF 后台看报错日志
        return new Response("服务器内部错误", { status: 500 });
    }
}
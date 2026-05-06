// /functions/api/delete.js
export async function onRequestDelete(context) {
    try {
        // 1. 接收前端传来的要删除的卡片 ID
        const data = await context.request.json();
        const { id } = data;

        if (!id) return new Response("缺少节点 ID", { status: 400 });

        // 2. 从 D1 数据库中物理删除
        await context.env.DB.prepare("DELETE FROM links WHERE id = ?").bind(id).run();

        // 3. 从 Vectorize AI 记忆库中抹除这个节点的坐标
        // 注意：Vectorize 要求的 ID 是字符串格式
        await context.env.VECTOR_INDEX.deleteByIds([id.toString()]);

        // 4. 销毁旧的 KV 缓存，确保首页立刻更新
        await context.env.KV_CACHE.delete("all_links_data");

        return new Response(JSON.stringify({ success: true, message: "节点已从系统中永久抹除" }), {
            headers: { "content-type": "application/json;charset=UTF-8" }
        });

    } catch (error) {
        console.log(error);
        return new Response("服务器内部错误", { status: 500 });
    }
}
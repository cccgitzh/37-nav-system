// /functions/api/add.js
export async function onRequestPost(context) {
    try {
        const data = await context.request.json();
        const { title, url, description, category, icon, color_theme } = data;

        if (!title || !url || !category) {
            return new Response("标题、网址和分类不能为空", { status: 400 });
        }

        // 1. 把新导航卡片的数据写入 D1 数据库
        await context.env.DB.prepare(
            "INSERT INTO links (title, url, description, category, icon, color_theme) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(title, url, description, category, icon, color_theme).run();

        // 2. 极速引擎的最关键一步：清理旧缓存！
        // 因为数据更新了，如果不把旧缓存删掉，前端看到的还是老数据
        await context.env.KV_CACHE.delete("all_links_data");

        return new Response(JSON.stringify({ success: true, message: "节点接入成功，旧缓存已销毁" }), {
            headers: { "content-type": "application/json;charset=UTF-8" }
        });

    } catch (error) {
        return new Response("服务器内部错误", { status: 500 });
    }
}
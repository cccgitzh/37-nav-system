// /functions/api/add.js
export async function onRequestPost(context) {
    try {
        // 1. 获取前端填写的表单数据
        const data = await context.request.json();
        const { title, url, description, category, icon, color_theme } = data;

        // 2. 简单的安全检查：确保必填项不是空的
        if (!title || !url || !category) {
            return new Response("标题、网址和分类不能为空", { status: 400 });
        }

        // 3. 将数据插入到 D1 数据库的 links 表中
        const info = await context.env.DB.prepare(
            "INSERT INTO links (title, url, description, category, icon, color_theme) VALUES (?, ?, ?, ?, ?, ?)"
        ).bind(title, url, description, category, icon, color_theme).run();

        // 4. 告诉前端：添加成功！
        return new Response(JSON.stringify({ success: true, message: "节点接入成功" }), {
            headers: { "content-type": "application/json;charset=UTF-8" }
        });

    } catch (error) {
        return new Response("服务器内部错误", { status: 500 });
    }
}
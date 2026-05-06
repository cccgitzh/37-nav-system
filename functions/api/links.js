// 这是 Cloudflare Pages Functions 的标准写法
export async function onRequest(context) {
    try {
        // context.env.DB 就是我们刚才绑定的名为 DB 的数据库
        // 这行代码的意思是：去 links 表里把所有数据查出来，按照 id 倒序排列
        const { results } = await context.env.DB.prepare(
            "SELECT * FROM links ORDER BY id DESC"
        ).all();

        // 把查到的数据打包成 JSON 格式，发送给前端
        return new Response(JSON.stringify(results), {
            headers: {
                "content-type": "application/json;charset=UTF-8",
                // 允许跨域访问（防止本地测试时报错）
                "Access-Control-Allow-Origin": "*",
            },
        });
    } catch (error) {
        return new Response("Database Error", { status: 500 });
    }
}
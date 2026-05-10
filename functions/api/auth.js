export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { password } = body;

        // 获取环境变量中的密码，默认回退为 root
        const expectedPassword = env.ADMIN_PASSWORD || 'root';

        if (password === expectedPassword) {
            // 【核心修复】：生成与 _auth.js 互相匹配的 Base64 令牌
            const token = btoa(expectedPassword + "||37nav");
            return new Response(JSON.stringify({ status: "success", token: token }), {
                headers: { "Content-Type": "application/json" }
            });
        } else {
            return new Response(JSON.stringify({ status: "error", message: "Invalid credentials" }), {
                status: 401,
                headers: { "Content-Type": "application/json" }
            });
        }
    } catch (e) {
        return new Response(JSON.stringify({ status: "error", message: e.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" }
        });
    }
}
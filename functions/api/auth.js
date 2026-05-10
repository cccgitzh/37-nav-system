export async function onRequestPost(context) {
    try {
        const { request, env } = context;
        const body = await request.json();
        const { password } = body;

        const expectedPassword = env.ADMIN_PASSWORD || 'root';

        if (password === expectedPassword) {
            return new Response(JSON.stringify({ status: "success", token: "AUTHORIZED" }), {
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

// /functions/api/links.js
export async function onRequest(context) {
    try {
        const cacheKey = "all_links_data"; // 我们给存进 KV 的数据起个代号

        // 步骤 1：先去 KV 快递柜里找找看有没有缓存的数据
        const cachedData = await context.env.KV_CACHE.get(cacheKey);
        if (cachedData) {
            // 如果有，直接把缓存的数据光速扔给前端，结束工作！
            return new Response(cachedData, {
                headers: { "content-type": "application/json;charset=UTF-8" },
            });
        }

        // 步骤 2：如果 KV 里没找到（比如第一次访问，或者缓存被清空了），老老实实去 D1 仓库拿
        const { results } = await context.env.DB.prepare(
            "SELECT * FROM links ORDER BY id DESC"
        ).all();
        
        const jsonString = JSON.stringify(results);

        // 步骤 3：拿到数据后，别忘了往 KV 快递柜里存一份，方便下次直接用
        await context.env.KV_CACHE.put(cacheKey, jsonString);

        // 最后把数据发给前端
        return new Response(jsonString, {
            headers: { "content-type": "application/json;charset=UTF-8" },
        });

    } catch (error) {
        return new Response("Database Error", { status: 500 });
    }
}
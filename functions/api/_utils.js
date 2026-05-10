export function getMandatoryWhiteList() {
    return {
        "bilibili.com": { siteName: "B站", siteDesc: "动漫番剧弹幕视频，追剧看番超全", siteCategory: "视频音乐" },
        "v2ex.com": { siteName: "V站", siteDesc: "程序员极客社区，聊科技数码干货", siteCategory: "论坛" },
        "taobao.com": { siteName: "淘宝", siteDesc: "综合网购平台，啥都能买超方便", siteCategory: "购物" },
        "zhihu.com": { siteName: "知乎", siteDesc: "知识问答社区，看干货涨见识", siteCategory: "论坛" },
        "github.com": { siteName: "GitHub", siteDesc: "全球最大开源代码托管与协作平台", siteCategory: "探索基地" },
        "youtube.com": { siteName: "油管", siteDesc: "全球最大的流媒体视频分享生态", siteCategory: "视频音乐" },
        "xiaohongshu.com": { siteName: "小红书", siteDesc: "种草攻略社区，吃喝玩乐全搞定", siteCategory: "论坛" },
        "baidu.com": { siteName: "百度", siteDesc: "中文搜索引擎，查东西超好用", siteCategory: "探索基地" },
        "weibo.com": { siteName: "微博", siteDesc: "热点吃瓜平台，最新资讯全掌握", siteCategory: "论坛" },
        "douyin.com": { siteName: "抖音", siteDesc: "短视频平台，刷视频停不下来", siteCategory: "视频音乐" },
        "pan.baidu.com": { siteName: "百度网盘", siteDesc: "云存储工具，文件备份分享神器", siteCategory: "探索基地" },
        "mail.qq.com": { siteName: "QQ邮箱", siteDesc: "腾讯邮箱，收发邮件超便捷", siteCategory: "通讯" },
        "csdn.net": { siteName: "CSDN", siteDesc: "程序员博客，编程学习干货超多", siteCategory: "探索基地" },
        "acfun.cn": { siteName: "A站", siteDesc: "二次元弹幕视频，番剧资源齐全", siteCategory: "视频音乐" },
        "tieba.baidu.com": { siteName: "贴吧", siteDesc: "兴趣交流社区，找到志同道合的人", siteCategory: "论坛" },
        "mail.google.com": { siteName: "谷歌邮箱", siteDesc: "安全高效的免费电子邮件服务", siteCategory: "通讯" },
        "gemini.google.com": { siteName: "Gemini", siteDesc: "Google 旗下原生多模态人工智能大模型", siteCategory: "AI人工智能" },
        "chatgpt.com": { siteName: "ChatGPT", siteDesc: "OpenAI 旗下的现象级 AI 聊天机器人", siteCategory: "AI人工智能" },
        "dash.cloudflare.com": { siteName: "CF 控制台", siteDesc: "全球领先的边缘计算与 CDN 管理平台", siteCategory: "探索基地" },
        "claude.ai": { siteName: "Claude", siteDesc: "Anthropic 开发的高智能 AI 助手", siteCategory: "AI人工智能" },
        "duckduckgo.com": { siteName: "DuckDuckGo", siteDesc: "不追踪用户的隐私保护搜索引擎", siteCategory: "探索基地" },
        "wikipedia.org": { siteName: "维基百科", siteDesc: "自由的百科全书，人类知识的基石", siteCategory: "知识" },
        "reddit.com": { siteName: "Reddit", siteDesc: "全球最大的综合性兴趣社区", siteCategory: "论坛" },
        "netflix.com": { siteName: "网飞", siteDesc: "全球领先的流媒体点播平台", siteCategory: "视频音乐" }
    };
}

export function getRootDomain(d) {
    if(!d) return "";
    const p = d.split('.');
    if (p.length < 2) return d;

    // 处理 .com.cn / .net.cn 等双重后缀
    const doubleSuffixes = ['com.cn', 'net.cn', 'org.cn', 'gov.cn', 'edu.cn'];
    const lastTwo = `${p[p.length-2]}.${p[p.length-1]}`.toLowerCase();

    if (doubleSuffixes.includes(lastTwo) && p.length >= 3) {
        return `${p[p.length-3]}.${lastTwo}`;
    }

    return `${p[p.length-2]}.${p[p.length-1]}`;
}

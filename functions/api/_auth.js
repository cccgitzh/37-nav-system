export function checkAuth(request, env) {
    const authHeader = request.headers.get('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return false;
    }
    const token = authHeader.split(' ')[1];
    const expectedPassword = env.ADMIN_PASSWORD || 'root';
    const expectedToken = btoa(expectedPassword + "||37nav");
    return token === expectedToken;
}
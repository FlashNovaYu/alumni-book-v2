type TestRequest = (path: string, options?: RequestInit) => Promise<Response>

const TEST_USERNAME = 'test-owner'
const TEST_PASSWORD = 'test-admin-123'

export async function loginTestAdmin(request: TestRequest): Promise<string> {
  const legacy = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'admin888' }),
  })
  const legacyBody = await legacy.json() as any
  if (legacyBody.data?.token) return legacyBody.data.token

  if (legacyBody.data?.setupToken) {
    const setup = await request('/api/auth/setup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        setupToken: legacyBody.data.setupToken,
        username: TEST_USERNAME,
        displayName: '测试管理员',
        password: TEST_PASSWORD,
        confirmPassword: TEST_PASSWORD,
      }),
    })
    if (!setup.ok && setup.status !== 409) {
      throw new Error(`测试管理员初始化失败：${setup.status}`)
    }
  }

  const login = await request('/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ username: TEST_USERNAME, password: TEST_PASSWORD }),
  })
  const body = await login.json() as any
  if (!login.ok || !body.data?.token) throw new Error(`测试管理员登录失败：${login.status}`)
  return body.data.token as string
}

import { RouterRepository } from '../repositories/router.repository'

// Safety guard: refuse to run in production
if (process.env.NODE_ENV === 'production') {
  console.error('❌ Seed script must not run in production.')
  process.exit(1)
}

const routerRepo = new RouterRepository()

const sampleRouters = [
  {
    id: process.env.SEED_ROUTER_1_ID || 'Mikrotik-Pusat',
    base_url: process.env.SEED_ROUTER_1_URL || 'http://192.168.88.1',
    username: process.env.SEED_ROUTER_1_USER || 'admin',
    password: process.env.SEED_ROUTER_1_PASS || 'CHANGE_ME',
  },
]

console.log('🌱 Seeding database with sample routers...')

async function main() {
  for (const router of sampleRouters) {
    if (router.password === 'CHANGE_ME') {
      console.warn(
        `⚠️  Router ${router.id} is using the default placeholder password. Set SEED_ROUTER_1_PASS env var.`
      )
    }
    await routerRepo.save(router)
    console.log(`✅ Router added: ${router.id} (${router.base_url})`)
  }

  console.log('✨ Seeding completed.')
  process.exit(0)
}

await main()

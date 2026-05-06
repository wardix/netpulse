import { RouterRepository } from '../repositories/router.repository'

const routerRepo = new RouterRepository()

const sampleRouters = [
  {
    id: 'Mikrotik-Pusat',
    base_url: 'http://192.168.88.1',
    username: 'admin',
    password: 'password123',
  },
  {
    id: 'Mikrotik-Cabang-A',
    base_url: 'http://10.0.0.1',
    username: 'api-user',
    password: 'secretpassword',
  },
]

console.log('🌱 Seeding database with sample routers...')

for (const router of sampleRouters) {
  routerRepo.save(router)
  console.log(`✅ Router added: ${router.id} (${router.base_url})`)
}

console.log('✨ Seeding completed.')
process.exit(0)

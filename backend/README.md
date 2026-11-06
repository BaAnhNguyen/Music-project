# Songbook API (scaffold)

Backend REST API cho ứng dụng soạn bản nhạc (lời + hợp âm). Hiện là **bộ khung**, chưa có logic nghiệp vụ.

## Chạy nhanh
```bash
cp .env.example .env
npm install
docker compose up -d postgres redis
npx prisma migrate dev --name init
npx prisma db seed
npm run dev            # Swagger: http://localhost:3000/docs
```

Redis chạy tại `localhost:6379` khi chạy backend ngoài Docker. Nếu muốn chạy
cả API, PostgreSQL và Redis trong Docker, tạo `.env` từ `.env.example` rồi chạy:

```bash
docker compose up --build
```

Trong mạng Docker Compose, API tự động kết nối Redis qua
`redis://redis:6379`.

## Lộ trình triển khai gợi ý
1. Auth (register/login, JWT, RolesGuard)
2. Songs CRUD + ChordPro parser + chord validator
3. Fork & Revision (optimistic locking bằng `version`)
4. Practice sessions (idempotency key, atomic update)
5. Playlist
6. Chord search (cache-aside Redis)
7. (Tùy chọn) Lessons, Metronome
8. Integration test (DB test thật), k6 benchmark

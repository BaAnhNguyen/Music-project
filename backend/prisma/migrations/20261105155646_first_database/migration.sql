-- CreateTable
CREATE TABLE "users" (
    "user_id" CHAR(36) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "password_hash" VARCHAR(255) NOT NULL,
    "display_name" VARCHAR(100) NOT NULL,
    "role" VARCHAR(20) NOT NULL DEFAULT 'user',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "users_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "roles" (
    "code" VARCHAR(20) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "songs" (
    "song_id" CHAR(36) NOT NULL,
    "owner_id" CHAR(36) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "artist" VARCHAR(255),
    "forked_from_id" CHAR(36),
    "raw_text" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "schema_version" INTEGER NOT NULL DEFAULT 1,
    "version" INTEGER NOT NULL DEFAULT 1,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'private',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "songs_pkey" PRIMARY KEY ("song_id")
);

-- CreateTable
CREATE TABLE "song_revisions" (
    "revision_id" CHAR(36) NOT NULL,
    "song_id" CHAR(36) NOT NULL,
    "version" INTEGER NOT NULL,
    "raw_text" TEXT NOT NULL,
    "content" JSONB NOT NULL,
    "created_by_id" CHAR(36) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "song_revisions_pkey" PRIMARY KEY ("revision_id")
);

-- CreateTable
CREATE TABLE "playlists" (
    "playlist_id" CHAR(36) NOT NULL,
    "owner_id" CHAR(36) NOT NULL,
    "name" VARCHAR(100) NOT NULL,
    "visibility" VARCHAR(20) NOT NULL DEFAULT 'private',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlists_pkey" PRIMARY KEY ("playlist_id")
);

-- CreateTable
CREATE TABLE "playlist_songs" (
    "playlist_id" CHAR(36) NOT NULL,
    "song_id" CHAR(36) NOT NULL,
    "position" INTEGER NOT NULL,
    "added_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "playlist_songs_pkey" PRIMARY KEY ("playlist_id","song_id")
);

-- CreateTable
CREATE TABLE "favorites" (
    "user_id" CHAR(36) NOT NULL,
    "song_id" CHAR(36) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "favorites_pkey" PRIMARY KEY ("user_id","song_id")
);

-- CreateTable
CREATE TABLE "practice_sessions" (
    "session_id" CHAR(36) NOT NULL,
    "user_id" CHAR(36) NOT NULL,
    "song_id" CHAR(36),
    "duration_sec" INTEGER NOT NULL,
    "practiced_at" TIMESTAMP(3) NOT NULL,
    "client_request_id" CHAR(36) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "practice_sessions_pkey" PRIMARY KEY ("session_id")
);

-- CreateTable
CREATE TABLE "practice_stats" (
    "user_id" CHAR(36) NOT NULL,
    "total_seconds" INTEGER NOT NULL DEFAULT 0,
    "total_sessions" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "practice_stats_pkey" PRIMARY KEY ("user_id")
);

-- CreateTable
CREATE TABLE "chord_shapes" (
    "chord_shape_id" CHAR(36) NOT NULL,
    "instrument" VARCHAR(20) NOT NULL,
    "root" VARCHAR(5) NOT NULL,
    "quality" VARCHAR(20) NOT NULL,
    "name" VARCHAR(20) NOT NULL,
    "difficulty" INTEGER NOT NULL,
    "frets" JSONB NOT NULL,
    "fingers" JSONB,

    CONSTRAINT "chord_shapes_pkey" PRIMARY KEY ("chord_shape_id")
);

-- CreateTable
CREATE TABLE "lessons" (
    "lesson_id" CHAR(36) NOT NULL,
    "title" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "level" INTEGER NOT NULL,

    CONSTRAINT "lessons_pkey" PRIMARY KEY ("lesson_id")
);

-- CreateTable
CREATE TABLE "lesson_prerequisites" (
    "lesson_id" CHAR(36) NOT NULL,
    "prerequisite_id" CHAR(36) NOT NULL,

    CONSTRAINT "lesson_prerequisites_pkey" PRIMARY KEY ("lesson_id","prerequisite_id")
);

-- CreateTable
CREATE TABLE "user_lesson_progress" (
    "user_id" CHAR(36) NOT NULL,
    "lesson_id" CHAR(36) NOT NULL,
    "completed_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_lesson_progress_pkey" PRIMARY KEY ("user_id","lesson_id")
);

-- CreateTable
CREATE TABLE "metronome_presets" (
    "preset_id" CHAR(36) NOT NULL,
    "owner_id" CHAR(36),
    "name" VARCHAR(100) NOT NULL,
    "bpm" INTEGER NOT NULL,
    "time_signature" VARCHAR(10) NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "metronome_presets_pkey" PRIMARY KEY ("preset_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "songs_owner_id_idx" ON "songs"("owner_id");

-- CreateIndex
CREATE INDEX "songs_forked_from_id_idx" ON "songs"("forked_from_id");

-- CreateIndex
CREATE INDEX "songs_visibility_created_at_idx" ON "songs"("visibility", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "song_revisions_song_id_version_key" ON "song_revisions"("song_id", "version");

-- CreateIndex
CREATE INDEX "playlists_owner_id_idx" ON "playlists"("owner_id");

-- CreateIndex
CREATE INDEX "playlist_songs_playlist_id_position_idx" ON "playlist_songs"("playlist_id", "position");

-- CreateIndex
CREATE INDEX "favorites_user_id_created_at_idx" ON "favorites"("user_id", "created_at");

-- CreateIndex
CREATE INDEX "practice_sessions_user_id_practiced_at_idx" ON "practice_sessions"("user_id", "practiced_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "practice_sessions_user_id_client_request_id_key" ON "practice_sessions"("user_id", "client_request_id");

-- CreateIndex
CREATE INDEX "chord_shapes_instrument_root_quality_idx" ON "chord_shapes"("instrument", "root", "quality");

-- CreateIndex
CREATE INDEX "chord_shapes_instrument_difficulty_idx" ON "chord_shapes"("instrument", "difficulty");

-- CreateIndex
CREATE INDEX "metronome_presets_owner_id_idx" ON "metronome_presets"("owner_id");

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_role_fkey" FOREIGN KEY ("role") REFERENCES "roles"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "songs" ADD CONSTRAINT "songs_forked_from_id_fkey" FOREIGN KEY ("forked_from_id") REFERENCES "songs"("song_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_revisions" ADD CONSTRAINT "song_revisions_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("song_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "song_revisions" ADD CONSTRAINT "song_revisions_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlists" ADD CONSTRAINT "playlists_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_songs" ADD CONSTRAINT "playlist_songs_playlist_id_fkey" FOREIGN KEY ("playlist_id") REFERENCES "playlists"("playlist_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "playlist_songs" ADD CONSTRAINT "playlist_songs_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("song_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "favorites" ADD CONSTRAINT "favorites_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("song_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_sessions" ADD CONSTRAINT "practice_sessions_song_id_fkey" FOREIGN KEY ("song_id") REFERENCES "songs"("song_id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "practice_stats" ADD CONSTRAINT "practice_stats_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_prerequisites" ADD CONSTRAINT "lesson_prerequisites_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("lesson_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lesson_prerequisites" ADD CONSTRAINT "lesson_prerequisites_prerequisite_id_fkey" FOREIGN KEY ("prerequisite_id") REFERENCES "lessons"("lesson_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "user_lesson_progress" ADD CONSTRAINT "user_lesson_progress_lesson_id_fkey" FOREIGN KEY ("lesson_id") REFERENCES "lessons"("lesson_id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "metronome_presets" ADD CONSTRAINT "metronome_presets_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("user_id") ON DELETE CASCADE ON UPDATE CASCADE;

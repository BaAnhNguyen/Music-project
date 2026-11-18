// Giới hạn nghiệp vụ cho buổi luyện tập (dùng chung DTO + service + test)
export const MIN_DURATION_SEC = 10;
export const MAX_DURATION_SEC = 4 * 60 * 60; // 14400 = 4 giờ
// Cho phép lệch đồng hồ client/server: practicedAt không được vượt quá "bây giờ" + 5 phút
export const FUTURE_TOLERANCE_MS = 5 * 60 * 1000;

export const TIMELINE_PERIODS = ['day', 'week', 'month'] as const;
export type TimelinePeriod = (typeof TIMELINE_PERIODS)[number];

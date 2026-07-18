/** 学生信息 */
export interface Student {
  id: string
  name: string
  slug: string
  isOwner: boolean
  avatarUrl: string | null
  musicUrl: string | null
  musicTitle: string | null
  musicAutoplay: boolean
  backgroundUrl: string | null
  backgroundColor: string | null
  customHtml: string | null
  info: StudentInfo
  photos: string[]
  media?: { variants: MediaVariant[] } | null
  visitCount: number
  createdAt: string
  updatedAt: string
  privacyLevel?: string
  editSecret?: string
  accountStatus?: string
  accountLastLoginAt?: string
}

export interface ClassmateSessionStudent {
  name: string
  slug: string
  avatarUrl: string | null
}

export interface ClassmateLoginResponse {
  token: string
  mustChangePassword: boolean
  student: ClassmateSessionStudent
}


/** 学生详细信息 */
export interface StudentInfo {
  name: string
  nickname: string
  gender: string
  birthday: string
  school: string
  class: string
  studentId: string
  seatNo: string
  dormNo: string
  groupName: string
  graduationYear: string
  qq: string
  wechat: string
  weibo: string
  phone: string
  email: string
  address: string
  douyinId: string
  kuaishou: string
  bilibili: string
  mbti: string
  bloodType: string
  astro: string
  strengths: string
  weaknesses: string
  bestSubject: string
  worstSubject: string
  motto: string
  favoriteIdol: string
  favoriteAnime: string
  favoriteMovie: string
  favoriteSong: string
  favoriteGame: string
  favoriteFood: string
  favoriteColor: string
  favoriteSport: string
  bestMemory: string
  bestLesson: string
  deskmateFun: string
  classMeme: string
  embarrassingMoment: string
  proudestAchievement: string
  targetUniversity: string
  targetMajor: string
  futureCareer: string
  futureCity: string
  futureSelf: string
  letterToFuture: string
  letterToClassmates: string
  profileModules?: Array<{
    type?: string
    title: string
    content: string
  }>
  visibility?: Record<string, 'public' | 'classmates' | 'owner' | 'hidden'>
}

/** 同学名单条目 */
export interface ClassmateEntry {
  name: string
  slug: string
  hasPage: boolean
  hasStandardProfile?: boolean
  avatarUrl: string | null
  avatarMedia?: { variants: MediaVariant[] } | null
  motto: string
  nickname?: string
  school?: string
  className?: string
  mbti?: string
  seatNo?: string
  dormNo?: string
  groupName?: string
  completion?: number
  tags?: string[]
}

export interface MuseumConfig {
  enabled: boolean
  heroEyebrow: string
  heroTitle: string
  heroSubtitle: string
  particleLevel: 'off' | 'low' | 'medium' | 'high'
  enableClassGraph: boolean
  enableSeatMap: boolean
}

export type MuseumThemeConfig = MuseumConfig

export interface SiteIdentityConfig {
  siteName: string
  className: string
  classYear: string
  shareDescription: string
}

/** 站点配置 */
export interface SiteConfig {
  particles: Record<string, { enabled: boolean; preset: string }>
  footer: {
    copyright: string
    beian: string
    beianUrl: string
  }
  preface: {
    title: string
    subtitle: string
    content: string
  }
  acknowledgments: Acknowledgment[]
  typography: {
    fontFamily: string
    fontSize: number
  }
  identity: SiteIdentityConfig
  museum?: MuseumThemeConfig
}

/** 致谢人物 */
export interface Acknowledgment {
  name: string
  role: string
  tip: string
  avatarUrl: string
}

/** 相册 */
export interface Album {
  id: string
  title: string
  description: string
  frameStyle: 'none' | 'retro' | 'film' | 'polaroid'
  sortOrder: number
  photos: Photo[]
  createdAt: string
}

/** 照片 */
export interface Photo {
  id: string
  albumId: string
  filename: string
  caption: string
  r2Key: string
  sortOrder: number
  createdAt: string
  media?: { variants: MediaVariant[] } | null
}

/** Image derivative metadata stored alongside an original R2 object. */
export interface MediaVariant {
  key: string
  contentType: string
  width: number
  height: number
  kind: string
}

/** A responsive media source. Legacy records only carry src/r2Key. */
export interface MediaAsset {
  src: string
  srcset: string
  sizes: string
  width?: number
  height?: number
  variants?: MediaVariant[]
}

/** 留言 */
export interface Message {
  id: string
  studentSlug: string
  authorName: string
  content: string
  reactions: Record<string, number>
  reply: string | null
  replyAt: string | null
  isApproved: boolean
  isHidden: boolean
  createdAt: string
}

/** API 响应 */
export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  message?: string
}

/** 分页响应 */
export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface ClassGraphNode {
  slug: string
  name: string
  groupName?: string
  mbti?: string
  favoriteSong?: string
  messageCount: number
}

export interface ClassGraphEdge {
  from: string
  to: string
  reason: 'group' | 'message' | 'interest'
  weight: number
}

export interface ClassGraphPayload {
  nodes: ClassGraphNode[]
  edges: ClassGraphEdge[]
}

export interface SeatMapSeat {
  slug: string
  name: string
  seatNo: string
  groupName?: string
}

export interface SeatMapPayload {
  seats: SeatMapSeat[]
  missingSeatCount: number
}


export type PublicMessageStatus = 'pending' | 'approved' | 'rejected' | 'hidden'

export interface PublicMessage {
  id: string
  authorSlug: string
  authorName: string
  content: string
  cardStyle: 'paper' | 'chalkboard' | 'photoback' | 'letter'
  status: PublicMessageStatus
  reviewReason?: string | null
  featured: boolean
  pinned: boolean
  reactions: Record<string, number>
  createdAt: string
  reviewedBy?: string | null
  reviewedAt?: string | null
}

export type GroupChatStatus = 'visible' | 'hidden' | 'recalled_by_author' | 'recalled_by_admin' | 'pending' | 'rejected'

export interface GroupChatMessage {
  id: string
  author: ClassmateSessionStudent
  content: string | null
  status: GroupChatStatus
  replyTo: { id: string; authorName: string; preview: string } | null
  reactionCounts: Record<string, number>
  myReaction: string | null
  canRecall: boolean
  moderationReason?: string | null
  createdAt: string
  updatedAt: string
}

export interface DirectConversation {
  id: string
  peer: ClassmateSessionStudent
  lastMessage: Pick<DirectMessage, 'id' | 'senderSlug' | 'body' | 'createdAt'> | null
  unreadCount: number
  updatedAt: string
}

export interface DirectMessage {
  id: string
  conversationId: string
  senderSlug: string
  recipientSlug: string
  body: string
  createdAt: string
}

export interface NotificationItem {
  id: string
  type: string
  title: string
  body: string
  relatedType?: string | null
  relatedId?: string | null
  readAt?: string | null
  createdAt: string
}

export interface NotificationSummary {
  unreadCount: number
}

export type MailThreadType = 'private' | 'admin' | 'system'

export interface MailboxThread {
  id: string
  subject: string
  threadType: MailThreadType
  senderName: string
  preview: string
  unread: boolean
  allowReply: boolean
  updatedAt: string
}

export interface MailboxMessage {
  id: string
  threadId: string
  senderType: 'student' | 'admin' | 'system'
  senderSlug?: string | null
  senderName: string
  body: string
  createdAt: string
}

export interface MailboxSummary {
  unreadCount: number
}

export interface ClassSpaceAlbumPreview {
  id: string
  title: string
  coverR2Key: string | null
  photoCount: number
  tags: string[]
}

export interface ClassSpaceTimelinePreview {
  id: string
  type: 'event' | 'message' | 'photo' | 'join'
  title: string
  description?: string
  date: string
  photoUrl?: string | null
  eventType?: string
}

export interface ClassSpaceOverview {
  chat: {
    items: GroupChatMessage[]
    cursor: string | null
    mute: { reason: string; mutedUntil: string | null } | null
  }
  albums: ClassSpaceAlbumPreview[]
  timeline: ClassSpaceTimelinePreview[]
  counts: {
    groupMessages: number
    albums: number
    timelineItems: number
  }
}

export interface InboxSummary {
  directUnread: number
  notificationUnread: number
  totalUnread: number
  mailUnread?: number
}

export const ADMIN_PERMISSIONS = [
  'dashboard.view', 'moderation.view', 'moderation.manage', 'content.manage',
  'notifications.view', 'notifications.publish', 'students.manage',
  'site.settings.manage', 'admins.manage', 'audit.view',
] as const

export type AdminPermission = typeof ADMIN_PERMISSIONS[number]
export type AdminRoleId = 'owner' | 'content_admin' | 'moderator' | 'operator'
export type AdminPermissionOverride = { permission: AdminPermission; effect: 'allow' | 'deny' }

export interface AdminIdentity {
  id: string
  displayName: string
  accountType: 'standalone' | 'classmate_linked'
  studentSlug: string | null
  isOwner: boolean
  mustChangePassword: boolean
  permissions: AdminPermission[]
}

export interface AdminAccountSummary {
  id: string
  accountType: 'standalone' | 'classmate_linked'
  username: string | null
  displayName: string
  studentSlug: string | null
  roleId: AdminRoleId
  status: 'active' | 'disabled'
  isOwner: boolean
  mustChangePassword: boolean
  lastLoginAt: string | null
  createdAt: string
  canDisable: boolean
  permissionOverrides: AdminPermissionOverride[]
  permissions: AdminPermission[]
}

export interface AdminAuditLog {
  id: string
  admin_account_id: string
  admin_display_name: string
  action: string
  resource_type: string
  resource_id: string
  reason: string | null
  before_summary: string | null
  after_summary: string | null
  created_at: string
}

export interface MailboxThreadDetail {
  thread: Pick<MailboxThread, 'id' | 'subject' | 'threadType' | 'allowReply' | 'updatedAt'>
  messages: MailboxMessage[]
}

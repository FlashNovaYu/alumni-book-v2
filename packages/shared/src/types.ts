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
  avatarUrl: string | null
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
  reviewedAt?: string | null
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

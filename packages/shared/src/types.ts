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
}

/** 同学名单条目 */
export interface ClassmateEntry {
  name: string
  slug: string
  hasPage: boolean
  avatarUrl: string | null
  motto: string
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

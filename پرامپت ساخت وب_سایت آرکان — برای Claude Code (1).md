# پرامپت ساخت وب‌سایت آرکان — برای Claude Code

> این فایل را همراه `arkan-client-brief.md` و `arkan-brand-guide.md` در ریشه‌ی پروژه قرار بده و متن زیر را به Claude Code بده.
>
> **نکته‌ی بسیار مهم:** این پرامپت به زبان فارسی نوشته شده، اما **تمام محتوای نهایی وب‌سایت باید به زبان انگلیسی باشد**. خود سایت باید کاملاً **English / LTR** طراحی و پیاده‌سازی شود.

---

## نقش و هدف

تو یک مهندس ارشد فرانت‌اند و طراح ارشد UI/UX هستی. قرار است وب‌سایت رسمی شرکت **Arkan** را بسازی؛ یک شرکت مشاور در زمینه‌ی استراتژی و رشد کسب‌وکار.

قبل از هر کاری، دو فایل زیر را در ریشه‌ی پروژه به‌طور کامل بخوان:

- `arkan-client-brief.md`
- `arkan-brand-guide.md`

تمام تصمیم‌های مربوط به محتوا، پیام برند، ساختار، لحن، طراحی و تجربه‌ی کاربری باید بر اساس این دو فایل باشند.

**مهم:** برای طراحی و ساخت کل وب‌سایت از اسکیل `/ui-ux-pro-max` استفاده کن. این اسکیل را در ابتدای کار فعال کن و اصول طراحی، UX و کیفیت بصری آن را در تمام بخش‌های سایت رعایت کن. توکن‌ها و قواعد برند Arkan باید در چارچوب همین اسکیل اعمال شوند.

### هدف اصلی سایت

هدف اصلی وب‌سایت این است که بازدیدکننده را به پر کردن **Consultation Request Form** برساند.

این سایت فروشگاه آنلاین نیست و هیچ تراکنش یا پرداختی ندارد.

---

# قانون بسیار مهم زبان و جهت سایت

اگرچه این prompt به زبان فارسی نوشته شده است، **وب‌سایت باید 100٪ انگلیسی باشد.**

تمام موارد زیر باید به زبان انگلیسی باشند:

- Headings
- Body copy
- Buttons
- Navigation
- Form labels
- Form placeholders
- Validation messages
- Success / error messages
- Footer
- SEO metadata
- Open Graph metadata
- Accessibility labels
- Any visible UI text
- Any user-facing error or loading state

### زبان و جهت

سایت باید کاملاً:

- **English**
- **LTR**
- `lang="en"`
- `dir="ltr"`

باشد.

در `<html>` از موارد زیر استفاده کن:

```html
<html lang="en" dir="ltr">
```

**از RTL، فارسی یا `lang="fa"` در خود وب‌سایت استفاده نکن.**

---

# استک فنی

- **Next.js 14+** با App Router و TypeScript
- **Tailwind CSS** برای استایل
- **English / LTR** به‌صورت کامل
- فونت اصلی انگلیسی را بر اساس `arkan-brand-guide.md` انتخاب کن.
- اگر Brand Guide فونت مشخصی معرفی نکرده، از یک sans-serif مدرن و حرفه‌ای استفاده کن که با شخصیت برند Arkan سازگار باشد.
- فونت را با `next/font` ترجیحاً بهینه‌سازی کن.
- فرم: ذخیره در **Supabase** در جدول `leads` + ارسال ایمیل اطلاع‌رسانی.
- اگر Supabase در دسترس نبود، یک API route با ذخیره‌ی موقت بساز و محل اتصال Supabase را با کامنت مشخص کن.
- پروژه باید آماده‌ی استقرار روی **Vercel** باشد.

> این ساختار عمداً با فاز بعدی محصول، یعنی chatbot، سازگار باشد؛ پایگاه داده‌ی Supabase در آینده قابل استفاده‌ی مجدد خواهد بود.

---

# توکن‌های طراحی

در `tailwind.config` این رنگ‌ها را تعریف کن:

```ts
pine:  '#143A32'
brass: '#B5853A'
bone:  '#F7F3EC'
sand:  '#E7DECF'
ink:   '#15201C'
slate: '#5A5F5B'
```

### اصول طراحی

- Card radius: `12px`
- Button radius: `8px`
- فضای سفید زیاد
- Layout تمیز و editorial
- سایه‌ها بسیار ملایم
- بدون gradientهای پررنگ یا تزئینی
- طراحی premium، حرفه‌ای و understated
- از شلوغی بصری، decoration غیرضروری و animationهای زیاد خودداری کن.

### نسبت رنگ

تقریباً:

- 60٪ روشن / Bone
- 30٪ Pine
- 10٪ Brass

### CTA اصلی

CTA اصلی باید:

- background: `pine`
- text: `bone`

باشد.

از Brass به‌عنوان متن کوچک روی پس‌زمینه‌ی سفید استفاده نکن؛ در صورت نیاز از Brass برای accent، border، icon، numbering یا عناصر بصری محدود استفاده کن.

---

# مقیاس تایپوگرافی

- H1: `48px`
- H2: `32px`
- H3: `24px`
- Body: `17px`
- Body line-height: `1.8`

برای موبایل typography را responsive کن و از اندازه‌های غیرمنطقی یا بیش‌ازحد بزرگ جلوگیری کن.

---

# ساختار صفحه

سایت یک **single-page website** با smooth scrolling و anchor navigation باشد.

ترتیب بخش‌ها:

1. Sticky Header
2. Hero
3. Services
4. Four Pillars / Methodology
5. Process
6. Credibility
7. Consultation Request Form
8. Footer

---

# 1. Sticky Header

Header باید در بالای صفحه sticky باشد.

ساختار:

- سمت چپ: لوگوتایپ **Arkan**
- مرکز / navigation:
  - Services
  - Process
  - About
  - Contact
- سمت راست: CTA button
  - **Request a Consultation**

CTA باید به فرم Consultation Request اسکرول کند.

در موبایل:

- لوگو
- hamburger menu
- navigation به‌صورت mobile menu
- CTA در mobile menu یا header به‌شکل مناسب

Header باید minimal و premium باشد.

---

# 2. Hero

Hero باید اولین و مهم‌ترین پیام برند را منتقل کند.

بر اساس `arkan-client-brief.md` و `arkan-brand-guide.md` یک headline قدرتمند انگلیسی درباره‌ی **sustainable business growth** بنویس.

لحن:

- Clear
- Confident
- Strategic
- Professional
- Human
- No exaggeration
- No guaranteed claims

Hero شامل:

### Headline

یک headline کوتاه، قدرتمند و memorable.

### Supporting copy

یک توضیح کوتاه که به‌وضوح توضیح دهد Arkan چه کاری انجام می‌دهد و برای چه نوع کسب‌وکارهایی ارزش ایجاد می‌کند.

### Primary CTA

**Request a Free Consultation**

این CTA باید به Consultation Request Form اسکرول کند.

Hero نباید شلوغ باشد.

از فضای سفید زیاد، typography قوی و composition حرفه‌ای استفاده کن.

---

# 3. Services

پنج خدمت اصلی را دقیقاً بر اساس `arkan-client-brief.md` استخراج کن.

برای هر service:

- یک icon خطی ساده
- عنوان
- یک توضیح کوتاه یک‌خطی

طراحی کارت‌ها باید تمیز و premium باشد.

از icon library سنگین استفاده نکن. اگر icon library لازم است، از یک solution سبک و مناسب استفاده کن.

---

# 4. Four Pillars / Methodology

این بخش یکی از امضاهای برند Arkan است.

چهار رکن:

1. Strategy
2. Structure
3. Market
4. Execution

این بخش باید visually distinctive باشد اما minimal باقی بماند.

برای هر pillar:

- شماره یا visual marker
- عنوان
- توضیح کوتاه

Layout باید مرتب، متعادل و premium باشد.

از طراحی بیش‌ازحد پیچیده یا decoration غیرضروری خودداری کن.

---

# 5. Collaboration Process

فرایند همکاری را در چهار مرحله نمایش بده:

1. **Submit a Request**
2. **Initial Conversation**
3. **Consultation Session**
4. **Roadmap**

به‌شکل timeline یا step-based layout طراحی شود.

هر مرحله شامل:

- شماره
- عنوان
- توضیح کوتاه

ارتباط بصری بین مراحل واضح باشد.

در موبایل timeline باید به‌صورت عمودی و خوانا تبدیل شود.

---

# 6. Credibility

این بخش باید اعتماد ایجاد کند، بدون اینکه حالت تبلیغاتی اغراق‌آمیز پیدا کند.

آمار:

- **7+ Years**
- **200+ Projects**
- **12-Person Team**

همچنین دو testimonial از `arkan-client-brief.md` استفاده کن.

**محتوای testimonialها را از خود brief استخراج کن و invent نکن.**

طراحی باید restrained و حرفه‌ای باشد.

---

# 7. Consultation Request Form

این مهم‌ترین بخش سایت است.

هدف اصلی تمام بخش‌های قبلی باید در نهایت کاربر را به این فرم هدایت کند.

عنوان و copy فرم را بر اساس Brand Guide بنویس.

مثلاً از ساختار مفهومی زیر استفاده کن، اما متن نهایی را خودت بر اساس برند بنویس:

- A short headline
- One concise supporting paragraph
- Consultation request form

## فیلدهای فرم

| Field | Type | Required |
|---|---|---|
| Full Name | text | Yes |
| Phone Number | tel | Yes |
| Email | email | No |
| Business Name | text | Yes |
| Industry | text | No |
| Business Stage | select | Yes |
| What is your biggest current challenge? | textarea | Yes |
| Preferred Contact Time | select | No |

### Business Stage options

```text
Idea
Early-stage
Growing
Established
```

### Preferred Contact Time options

```text
Morning
Afternoon
Evening
```

تمام labelها و optionها باید انگلیسی باشند.

---

# Form Behaviour

اعتبارسنجی سمت کلاینت انجام شود.

پیام‌های validation باید واضح، کوتاه و طبیعی باشند.

مثلاً:

```text
Please enter your full name.
Please enter your phone number.
Please enter your business name.
Please select your business stage.
Please describe your current challenge.
```

از پیام‌های فنی یا نامفهوم برای کاربر استفاده نکن.

---

## Submit

هنگام submit:

1. وضعیت loading فعال شود.
2. ورودی‌ها validate شوند.
3. داده‌ها به Supabase ارسال شوند.
4. رکورد در جدول `leads` ایجاد شود.
5. در صورت موفقیت پیام موفقیت نمایش داده شود.
6. در صورت خطا پیام مناسب نمایش داده شود.

### Success message

از این متن انگلیسی استفاده کن:

> **Your request has been submitted. The Arkan team will contact you within one business day.**

### Loading state

مثلاً:

> **Submitting...**

### Error state

مثلاً:

> **Something went wrong. Please try again or contact us directly.**

---

# Supabase Schema

جدول:

```text
leads
```

Schema:

```text
id (uuid, pk)
created_at (timestamptz)
full_name (text)
phone (text)
email (text)
business_name (text)
industry (text)
stage (text)
challenge (text)
preferred_time (text)
status (text, default 'new')
```

اگر Supabase environment variables موجود هستند، از آن‌ها استفاده کن.

از hard-code کردن credentials خودداری کن.

برای server-side operations از environment variables امن استفاده کن.

---

# Email Notification

بعد از ثبت موفق lead، امکان ارسال notification email را در نظر بگیر.

اگر email provider مشخصی در پروژه وجود ندارد:

- architecture را طوری طراحی کن که بعداً بتوان provider را اضافه کرد.
- credentials را hard-code نکن.
- integration point را واضح comment کن.

اگر email service در دسترس نبود، ذخیره‌ی Supabase نباید به‌خاطر آن fail شود؛ در صورت امکان notification را به‌صورت جداگانه مدیریت کن.

---

# 8. Footer

Footer شامل:

- Arkan logo / wordmark
- Short brand statement
- Email
- Phone
- Tehran
- Anchor navigation
- Copyright

تمام اطلاعات contact را فقط از `arkan-client-brief.md` استخراج کن.

اگر اطلاعاتی در brief وجود ندارد، آن را invent نکن.

---

# Content Rules

تمام متن‌های سایت باید:

- English
- Clear
- Concise
- Professional
- Confident
- Strategic
- Human

باشند.

لحن برند:

- Direct
- Reassuring without exaggeration
- Clear
- Mature
- Trustworthy

کاربر را با **"you"** خطاب کن.

جملات کوتاه و قابل‌فهم باشند.

### ممنوع:

- Lorem Ipsum
- Fake testimonials
- Fake statistics
- Fake clients
- Fake awards
- Fake case studies
- Guaranteed results
- Unrealistic promises
- Overly corporate jargon
- Excessive marketing language

هیچ claim جدیدی که در brief یا brand guide وجود ندارد اضافه نکن.

---

# Responsive Design

سایت باید کاملاً responsive باشد.

Desktop:

- spacious layout
- strong typography
- clear hierarchy
- generous whitespace

Tablet:

- layout باید بدون شکست responsive شود.

Mobile:

- full-width layout
- hamburger navigation
- stacked sections
- readable typography
- comfortable touch targets
- form fields تمام‌عرض
- CTA واضح و قابل دسترس

تمام interactionها باید روی touch device نیز به‌خوبی کار کنند.

---

# Accessibility

موارد زیر الزامی هستند:

- Semantic HTML
- Proper heading hierarchy
- Accessible buttons
- Keyboard navigation
- Visible focus states
- Sufficient color contrast
- Label برای تمام inputها
- Accessible error messages
- `aria-*` فقط در صورت نیاز
- Alt text برای تصاویر
- عدم وابستگی به color برای انتقال اطلاعات

فرم باید با keyboard به‌طور کامل قابل استفاده باشد.

---

# SEO

SEO پایه را برای یک شرکت مشاوره‌ی استراتژی و رشد کسب‌وکار پیاده‌سازی کن.

شامل:

- مناسب‌ترین `<title>`
- meta description
- Open Graph tags
- Twitter/X metadata در صورت نیاز
- favicon
- semantic HTML
- مناسب‌ترین heading structure
- canonical URL در صورت مشخص بودن domain

تمام metadata باید **English** باشند.

از keyword stuffing خودداری کن.

یک title و description طبیعی و حرفه‌ای بر اساس brief بنویس.

---

# Performance

پرفورمنس اهمیت زیادی دارد.

- Optimize images
- Lazy-load تصاویر غیرضروری
- Optimize fonts
- Avoid unnecessary JavaScript
- Avoid heavy libraries
- Use server components where appropriate
- Keep client components limited to interactive sections
- Avoid unnecessary animations
- Use CSS transitions where possible
- Keep bundle size reasonable

---

# Animation & Interaction

Animationها باید subtle و premium باشند.

مناسب:

- Fade-in بسیار ملایم
- Small translate transitions
- Hover states
- Smooth anchor scrolling
- Subtle section reveals

نامناسب:

- excessive parallax
- bouncing elements
- flashy animations
- constant motion
- distracting effects

Animation نباید مانع usability یا accessibility شود.

`prefers-reduced-motion` را رعایت کن.

---

# Component Architecture

کد باید تمیز، modular و component-based باشد.

هر بخش اصلی یک component جدا داشته باشد.

برای مثال:

```text
components/
├── Header.tsx
├── Hero.tsx
├── Services.tsx
├── Pillars.tsx
├── Process.tsx
├── Credibility.tsx
├── ConsultationForm.tsx
└── Footer.tsx
```

ساختار دقیق را بر اساس معماری پروژه بهینه کن و در صورت نیاز componentهای کوچک‌تر ایجاد کن.

از تکرار غیرضروری کد جلوگیری کن.

---

# Project Structure

ساختار پروژه را با Next.js App Router به‌شکل تمیز و قابل نگهداری ایجاد کن.

مثلاً:

```text
app/
├── layout.tsx
├── page.tsx
├── globals.css
└── api/

components/
lib/
public/
```

در صورت نیاز ساختار را بهتر کن.

---

# مهم: Brand Guide اولویت دارد

اگر بین این prompt و `arkan-brand-guide.md` یا `arkan-client-brief.md` تضادی وجود داشت:

1. Client Brief
2. Brand Guide
3. این Prompt

را به‌ترتیب اولویت در نظر بگیر.

اما قانون زبان این prompt را حفظ کن:

**The final website must be English and LTR.**

---

# ترتیب کاری که از تو می‌خواهم

کار را مرحله‌به‌مرحله انجام بده.

## مرحله 1 — بررسی فایل‌ها

ابتدا:

1. `/ui-ux-pro-max` را فعال کن.
2. `arkan-client-brief.md` را کامل بخوان.
3. `arkan-brand-guide.md` را کامل بخوان.
4. تصمیم‌های مهم محتوایی و بصری را استخراج کن.
5. یک خلاصه‌ی کوتاه از درک خودت ارائه بده.

در این مرحله هنوز وارد implementation نشو.

---

## مرحله 2 — Foundation

سپس:

1. ساختار پروژه را بررسی / ایجاد کن.
2. Tailwind را تنظیم کن.
3. design tokens را اضافه کن.
4. typography را تنظیم کن.
5. `lang="en"` و `dir="ltr"` را تنظیم کن.
6. global styles را ایجاد کن.
7. responsive breakpoints را بررسی کن.

---

## مرحله 3 — Header & Footer

سپس:

1. Sticky Header
2. Desktop navigation
3. Mobile navigation
4. Primary CTA
5. Footer

را بساز.

---

## مرحله 4 — Main Sections

سپس بخش‌ها را به همین ترتیب بساز:

1. Hero
2. Services
3. Four Pillars
4. Process
5. Credibility
6. Consultation Form

هر section باید component مستقل داشته باشد.

---

## مرحله 5 — Supabase

سپس:

1. Supabase client را تنظیم کن.
2. فرم را به جدول `leads` متصل کن.
3. validation را پیاده‌سازی کن.
4. loading state را پیاده‌سازی کن.
5. success state را پیاده‌سازی کن.
6. error state را پیاده‌سازی کن.
7. در صورت امکان email notification را اضافه کن.
8. environment variables را مستند کن.

---

## مرحله 6 — Final Review

در پایان کل سایت را بازبینی کن.

بررسی کن:

### Design

- آیا با Brand Guide مطابقت دارد؟
- آیا premium و professional است؟
- آیا فضای سفید کافی دارد؟
- آیا CTA واضح است؟
- آیا رنگ‌ها درست استفاده شده‌اند؟

### UX

- آیا مسیر کاربر به فرم واضح است؟
- آیا navigation درست کار می‌کند؟
- آیا anchor links درست هستند؟
- آیا mobile experience مناسب است؟

### Accessibility

- keyboard navigation
- focus states
- labels
- contrast
- semantic HTML
- reduced motion

### Technical

- TypeScript errors
- build errors
- responsive issues
- unnecessary client components
- performance issues
- SEO metadata
- Supabase integration

---

# نحوه‌ی گزارش پیشرفت

در هر مرحله:

1. ابتدا **خیلی مختصر** توضیح بده چه چیزی انجام دادی.
2. سپس implementation را انجام بده.
3. بعد به مرحله‌ی بعد برو.

از توضیحات طولانی و غیرضروری خودداری کن.

**مهم:** قبل از implementation مرحله‌ی اول، حتماً هر دو فایل brief و brand guide را بخوان و محتوای سایت را بر اساس آن‌ها تولید کن.

---

# Final Quality Bar

این سایت نباید شبیه یک template معمولی یا generic corporate website باشد.

هدف طراحی:

**Premium + Strategic + Minimal + Confident + Modern**

است.

سایت باید در نگاه اول حرفه‌ای، قابل اعتماد و متمایز به نظر برسد؛ بدون اینکه بیش‌ازحد flashy یا تبلیغاتی شود.

هر تصمیم طراحی باید یک دلیل UX یا brand داشته باشد.

**Do not add unnecessary sections just to make the page longer.**

**Do not invent content that is not supported by the client brief or brand guide.**

**The final website UI and all user-facing content must be English and LTR.**
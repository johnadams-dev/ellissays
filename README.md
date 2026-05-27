# Ellis — ellissays.com

> *The moment everything becomes clear.*

AI-powered home selling platform and licensed real estate brokerage. Marketing website for the Ellis platform.

---

## Structure

```
ellis-site/
├── index.html              # Homepage
├── css/
│   └── style.css           # Shared styles (all pages)
├── js/
│   ├── main.js             # Shared JavaScript (nav, forms, animations)
│   └── nav.js              # Nav HTML reference
├── pages/
│   ├── how-it-works.html   # How Ellis Works
│   ├── for-investors.html  # Investor subscriber program
│   ├── for-agents.html     # Agent partner program
│   └── contact.html        # Contact page
└── images/                 # (add brand assets here)
```

## Deploying to GitHub Pages

1. Push this repository to GitHub
2. Go to **Settings → Pages**
3. Set source to **Deploy from a branch → main → / (root)**
4. Site will be live at `https://[username].github.io/[repo-name]`

For custom domain (ellissays.com):
1. Add a `CNAME` file to the root containing: `ellissays.com`
2. In your domain registrar, add a CNAME record pointing `www` to `[username].github.io`
3. Add A records pointing the apex domain to GitHub Pages IPs:
   - 185.199.108.153
   - 185.199.109.153
   - 185.199.110.153
   - 185.199.111.153

## Email Capture

Forms currently store submissions to `localStorage` under the key `ellis_leads`.

To retrieve collected emails during development, run in browser console:
```javascript
JSON.parse(localStorage.getItem('ellis_leads'))
```

When ready to wire up an email service provider (Mailchimp, ConvertKit, etc.):
- Open `js/main.js`
- Find the `handleEmailForm` function
- Replace the `localStorage.setItem` call with your ESP's form submission endpoint

## Fonts

The site uses Google Fonts:
- **Playfair Display** — display headings (elegant, editorial)
- **DM Sans** — body text (clean, modern)
- **DM Mono** — labels, numbers, overlines (technical precision)

## Color Palette

| Variable | Value | Use |
|---|---|---|
| `--navy` | `#1C2B3A` | Primary brand, backgrounds |
| `--blue` | `#2C5F8A` | Links, accents, UI elements |
| `--clay` | `#C25B3F` | Primary CTA, highlights |
| `--sand` | `#F5F0E8` | Section backgrounds |
| `--cream` | `#FDFAF5` | Page background |

## Pages

| Page | File | Audience |
|---|---|---|
| Home | `index.html` | All homeowners |
| How It Works | `pages/how-it-works.html` | Curious homeowners |
| For Investors | `pages/for-investors.html` | Flippers / cash buyers |
| For Agents | `pages/for-agents.html` | Licensed agents |
| Contact | `pages/contact.html` | All audiences |

## Next Steps

- [ ] Add brand logo / favicon
- [ ] Wire email forms to ESP
- [ ] Add Google Analytics / privacy-respecting analytics
- [ ] Create `CNAME` file for custom domain
- [ ] Add OG image for social sharing
- [ ] SEO: add sitemap.xml and robots.txt

---

Built for ellissays.com · © 2026 Ellis

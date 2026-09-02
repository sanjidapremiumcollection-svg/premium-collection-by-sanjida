from pathlib import Path
import re, html
root=Path('/mnt/data/site_meta')
domain='https://sanjidapremiumcollection.online'
meta={
'index.html':('Premium Collection By Sanjida | Women’s Fashion & Beauty','Shop Premium Collection By Sanjida for women’s clothing, cosmetics and lifestyle essentials. Discover curated fashion and beauty collections online.'),
'collection.html':('Shop Collection | Premium Collection By Sanjida','Explore the curated women’s clothing and beauty collection from Premium Collection By Sanjida.'),
'category.html':('Categories | Premium Collection By Sanjida','Browse women’s clothing and cosmetics categories at Premium Collection By Sanjida.'),
'about.html':('About Us | Premium Collection By Sanjida','Learn about Premium Collection By Sanjida and our curated approach to women’s fashion, beauty and lifestyle.'),
'product.html':('Product | Premium Collection By Sanjida','View product details, pricing and ordering information at Premium Collection By Sanjida.'),
'cart.html':('Shopping Bag | Premium Collection By Sanjida','Review your selected products and continue shopping at Premium Collection By Sanjida.'),
'checkout.html':('Checkout | Premium Collection By Sanjida','Complete your order securely at Premium Collection By Sanjida.'),
'success.html':('Order Confirmed | Premium Collection By Sanjida','Your Premium Collection By Sanjida order has been received.'),
'privacy-policy.html':('Privacy Policy | Premium Collection By Sanjida','Read the privacy policy for Premium Collection By Sanjida.'),
'terms-and-conditions.html':('Terms & Conditions | Premium Collection By Sanjida','Read the terms and conditions for Premium Collection By Sanjida.'),
'return-and-cancellation-policy.html':('Return & Cancellation Policy | Premium Collection By Sanjida','Read the return and cancellation policy for Premium Collection By Sanjida.'),
}

def inject(path,title,desc):
    txt=path.read_text(encoding='utf-8')
    txt=re.sub(r'<title>.*?</title>', f'<title>{html.escape(title)}</title>', txt, count=1, flags=re.S|re.I)
    # remove prior generated block if rerun
    txt=re.sub(r'\n<!-- BRANDING-SEO-START -->.*?<!-- BRANDING-SEO-END -->\n', '\n', txt, flags=re.S)
    rel='/' if path.name=='index.html' else '/'+path.name
    canonical=domain+rel
    block=f'''\n<!-- BRANDING-SEO-START -->\n<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">\n<link rel="icon" type="image/png" sizes="48x48" href="/assets/favicon-48.png">\n<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n<meta name="theme-color" content="#0b1f3a">\n<meta name="description" content="{html.escape(desc)}">\n<link rel="canonical" href="{canonical}">\n<meta property="og:type" content="website">\n<meta property="og:site_name" content="Premium Collection By Sanjida">\n<meta property="og:title" content="{html.escape(title)}">\n<meta property="og:description" content="{html.escape(desc)}">\n<meta property="og:url" content="{canonical}">\n<meta property="og:image" content="{domain}/assets/brand-logo.png">\n<meta property="og:image:alt" content="Premium Collection By Sanjida logo">\n<meta name="twitter:card" content="summary_large_image">\n<meta name="twitter:title" content="{html.escape(title)}">\n<meta name="twitter:description" content="{html.escape(desc)}">\n<meta name="twitter:image" content="{domain}/assets/brand-logo.png">\n<!-- BRANDING-SEO-END -->\n'''
    txt=txt.replace('</head>',block+'</head>',1)
    path.write_text(txt,encoding='utf-8')

for name,(title,desc) in meta.items():
    inject(root/name,title,desc)

# Admin pages: keep them out of search results but still use favicon/title branding.
for name in ['admin.html','admin-login.html','admin-dashboard.html']:
    p=root/name
    if not p.exists(): continue
    txt=p.read_text(encoding='utf-8')
    txt=re.sub(r'\n<!-- BRANDING-SEO-START -->.*?<!-- BRANDING-SEO-END -->\n','\n',txt,flags=re.S)
    txt=re.sub(r'<title>.*?</title>', '<title>Premium Collection By Sanjida — Admin</title>', txt, count=1, flags=re.S|re.I)
    block='''\n<!-- BRANDING-SEO-START -->\n<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">\n<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">\n<meta name="robots" content="noindex,nofollow,noarchive">\n<!-- BRANDING-SEO-END -->\n'''
    txt=txt.replace('</head>',block+'</head>',1)
    p.write_text(txt,encoding='utf-8')

# admin/ copies
for name in ['index.html','dashboard.html']:
    p=root/'admin'/name
    if p.exists():
        txt=p.read_text(encoding='utf-8')
        txt=re.sub(r'\n<!-- BRANDING-SEO-START -->.*?<!-- BRANDING-SEO-END -->\n','\n',txt,flags=re.S)
        txt=re.sub(r'<title>.*?</title>', '<title>Premium Collection By Sanjida — Admin</title>', txt, count=1, flags=re.S|re.I)
        block='''\n<!-- BRANDING-SEO-START -->\n<link rel="icon" type="image/png" sizes="32x32" href="/assets/favicon-32.png">\n<link rel="apple-touch-icon" href="/assets/apple-touch-icon.png">\n<meta name="robots" content="noindex,nofollow,noarchive">\n<!-- BRANDING-SEO-END -->\n'''
        txt=txt.replace('</head>',block+'</head>',1)
        p.write_text(txt,encoding='utf-8')

# Add structured data to homepage only.
p=root/'index.html'
txt=p.read_text(encoding='utf-8')
txt=re.sub(r'\n<script type="application/ld\+json" id="brand-schema">.*?</script>\n','\n',txt,flags=re.S)
schema='''<script type="application/ld+json" id="brand-schema">\n{\n  "@context": "https://schema.org",\n  "@graph": [\n    {\n      "@type": "Organization",\n      "@id": "https://sanjidapremiumcollection.online/#organization",\n      "name": "Premium Collection By Sanjida",\n      "url": "https://sanjidapremiumcollection.online/",\n      "logo": "https://sanjidapremiumcollection.online/assets/brand-logo.png"\n    },\n    {\n      "@type": "WebSite",\n      "@id": "https://sanjidapremiumcollection.online/#website",\n      "name": "Premium Collection By Sanjida",\n      "url": "https://sanjidapremiumcollection.online/",\n      "publisher": {"@id": "https://sanjidapremiumcollection.online/#organization"}\n    }\n  ]\n}\n</script>\n'''
txt=txt.replace('</head>',schema+'</head>',1)
p.write_text(txt,encoding='utf-8')

# WWW → apex (один 301, без цепочек)
server {
    listen 80;
    server_name www.clover-spb.ru;

    location /.well-known/acme-challenge {
        alias /var/www/dehydrated/.well-known/acme-challenge;
    }

    location / {
        return 301 https://clover-spb.ru$request_uri;
    }
}

server {
    listen 443 ssl;
    server_name www.clover-spb.ru;

    ssl_certificate /dehydrated/certs/clover-spb.ru/fullchain.pem;
    ssl_certificate_key /dehydrated/certs/clover-spb.ru/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;

    return 301 https://clover-spb.ru$request_uri;
}

# HTTP apex → HTTPS apex
server {
    listen 80;
    server_name clover-spb.ru;

    location /.well-known/acme-challenge {
        alias /var/www/dehydrated/.well-known/acme-challenge;
    }

    location / {
        return 301 https://clover-spb.ru$request_uri;
    }
}

# Основной HTTPS-сервер (apex only)
server {
   listen 443 ssl;
#    listen [::]:443 ssl;
    server_name clover-spb.ru;

    # Пути к SSL-сертификатам (замените заглушки на актуальные пути)
    ssl_certificate /dehydrated/certs/clover-spb.ru/fullchain.pem;
    ssl_certificate_key /dehydrated/certs/clover-spb.ru/privkey.pem;

    # Рекомендуемые настройки безопасности SSL
    ssl_protocols TLSv1.2 TLSv1.3;
    ssl_ciphers HIGH:!aNULL:!MD5;
    ssl_prefer_server_ciphers on;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;

    # Security headers (B2B + корзина + ЛК)
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header Permissions-Policy "camera=(), microphone=(), geolocation=()" always;

    # Логирование
    access_log /var/log/nginx/clover-order.access.log;
    error_log /var/log/nginx/clover-order.error.log;

    # Hashed Vite assets — год, immutable
    location /assets/ {
        alias /opt/clover/clover-app/dist/assets/;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }

    location /fonts/ {
        alias /opt/clover/clover-app/dist/fonts/;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
        access_log off;
    }

    location ~* ^/(favicon\.png|favicon-32\.png|apple-touch-icon\.png|icon-.*\.png|icons\.svg)$ {
        proxy_pass http://192.168.155.15:5273;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_hide_header Cache-Control;
        expires 1y;
        add_header Cache-Control "public, max-age=31536000, immutable" always;
    }

    location = /index.html {
        proxy_pass http://192.168.155.15:5273;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_hide_header Cache-Control;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    }

    location = /sw.js {
        proxy_pass http://192.168.155.15:5273;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_hide_header Cache-Control;
        add_header Cache-Control "no-cache, no-store, must-revalidate" always;
    }

    location = /manifest.webmanifest {
        proxy_pass http://192.168.155.15:5273;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_hide_header Cache-Control;
        expires 1h;
        add_header Cache-Control "public, max-age=3600, must-revalidate" always;
    }

    location = /robots.txt {
        proxy_pass http://192.168.155.15:5273;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_hide_header Cache-Control;
        expires 1d;
        add_header Cache-Control "public, max-age=86400" always;
    }

    location = /sitemap.xml {
        proxy_pass http://192.168.155.15:5273;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_hide_header Cache-Control;
        expires 1d;
        add_header Cache-Control "public, max-age=86400" always;
    }

    # Реверс-прокси для корневого location
    location / {
        proxy_pass http://192.168.155.15:5273;
        
        # Передача необходимых заголовков на бэкенд
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
        
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /api/ {
        proxy_pass http://192.168.155.15:4100;

        # Передача необходимых заголовков на бэкенд
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }

    location /uploads/ {
        proxy_pass http://192.168.155.15:4100;

        # Передача необходимых заголовков на бэкенд
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;

        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        proxy_hide_header Cache-Control;
        expires 7d;
        add_header Cache-Control "public, max-age=604800" always;
    }

}

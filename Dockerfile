# Imagen no-root oficial de nginx: corre como usuario "nginx" (uid 101) y escucha en 8080
FROM nginxinc/nginx-unprivileged:1.28-alpine

# Configuración con security headers, CSP y server_tokens off
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Copiar solo los archivos que sirve el sitio (no README, Dockerfile, etc.)
COPY index.html styles.css /usr/share/nginx/html/
COPY *.html /usr/share/nginx/html/
COPY js/ /usr/share/nginx/html/js/

EXPOSE 8080

# Healthcheck con el wget de busybox incluido en la imagen base (no se instala curl/wget extra)
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["nginx", "-g", "daemon off;"]

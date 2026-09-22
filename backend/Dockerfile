# 构建上下文为仓库根目录: docker build -f backend/Dockerfile .
FROM maven:3.9-eclipse-temurin-21 AS build
WORKDIR /build
COPY backend/pom.xml .
RUN mvn -q -B dependency:go-offline
COPY backend/src ./src
RUN mvn -q -B -DskipTests package

FROM eclipse-temurin:21-jre
WORKDIR /app
COPY --from=build /build/target/quantsim-backend-*.jar app.jar
COPY frontend /app/frontend
ENV QUANTSIM_FRONTEND_DIR=/app/frontend
EXPOSE 8080
ENTRYPOINT ["java", "-jar", "app.jar"]

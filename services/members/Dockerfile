FROM mcr.microsoft.com/dotnet/sdk:10.0 AS build
WORKDIR /src
COPY Osprey.Members/Osprey.Members.csproj Osprey.Members/
RUN dotnet restore Osprey.Members
COPY Osprey.Members/ Osprey.Members/
RUN dotnet publish Osprey.Members -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:10.0-noble-chiseled
WORKDIR /app
COPY --from=build /app .
# Run as the image's non-root user (UID 1654); the chiseled runtime has no shell or package manager.
USER $APP_UID
EXPOSE 8080
ENTRYPOINT ["dotnet", "Osprey.Members.dll"]

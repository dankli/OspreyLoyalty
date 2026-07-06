FROM mcr.microsoft.com/dotnet/sdk:8.0 AS build
WORKDIR /src
COPY Osprey.Members/Osprey.Members.csproj Osprey.Members/
RUN dotnet restore Osprey.Members
COPY Osprey.Members/ Osprey.Members/
RUN dotnet publish Osprey.Members -c Release -o /app

FROM mcr.microsoft.com/dotnet/aspnet:8.0
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENTRYPOINT ["dotnet", "Osprey.Members.dll"]

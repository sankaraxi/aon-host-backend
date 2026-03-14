#!/bin/bash

# Accept arguments
question=$1
framework=$2
userId=$3

# Check for missing parameters
if [ -z "$question" ] || [ -z "$framework" ] || [ -z "$userId" ]; then
  echo "🚫 Error: Missing parameters. Usage: ./cleanup-docker.sh <question> <framework> <userId>"
  exit 1
fi

# Construct names
containerName="code-server-${question}-${framework}-${userId}"
imageName="sankarkg/${question}-${framework}"

echo "🧹 Attempting to clean up Docker environment..."
echo "Target container: $containerName"
echo "Target image: $imageName"

# Stop and remove the container if it exists
containerId=$(docker ps -a -q --filter "name=$containerName")
if [ -n "$containerId" ]; then
  docker rm -f "$containerId" >/dev/null
  echo "✅ Removed container: $containerName"
else
  echo "⚠️  No container found with name: $containerName"
fi

# # Remove the Docker image if it exists
# imageId=$(docker images -q "$imageName")
# if [ -n "$imageId" ]; then
#   docker rmi -f "$imageId" >/dev/null
#   echo "✅ Removed image: $imageName"
# else
#   echo "⚠️  No image found with name: $imageName"
# fi

# Optional cleanup for dangling stuff
# docker volume prune -f
# docker network prune -f

echo "✨ Docker cleanup script completed."

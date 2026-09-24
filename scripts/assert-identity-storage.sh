#!/usr/bin/env bash
# Fails a deployment that left the Functions host unable to reach its own storage.
#
# A plain `AzureWebJobsStorage` app setting wins over the identity-based `AzureWebJobsStorage__*`
# ones. Both apps were created with one whose connection string had an empty AccountKey, because the
# storage account has shared keys disabled, so the host authenticated with nothing: it never created
# its azure-webjobs-* containers, the host keys API answered InternalServerError, and every non-HTTP
# trigger stayed dead while the HTTP endpoints kept answering 200. Nothing surfaced that as a failure.
#
# The check is deliberately loud rather than self-healing: if this setting reappears, something in the
# platform or the deployment put it back and that is worth knowing, not papering over.
set -euo pipefail

group="${1:?usage: assert-identity-storage.sh <resource-group> <app-name>}"
app="${2:?usage: assert-identity-storage.sh <resource-group> <app-name>}"

plain=$(az functionapp config appsettings list --resource-group "$group" --name "$app" \
  --query "[?name=='AzureWebJobsStorage'] | length(@)" -o tsv)

missing=$(az functionapp config appsettings list --resource-group "$group" --name "$app" \
  --query "[?name=='AzureWebJobsStorage__blobServiceUri' || name=='AzureWebJobsStorage__queueServiceUri' || name=='AzureWebJobsStorage__tableServiceUri'] | length(@)" -o tsv)

if [ "$plain" != "0" ]; then
  echo "::error::the app has a key-based AzureWebJobsStorage setting; it overrides the identity-based"\
    "connection and leaves queue and timer triggers dead. Remove it:"\
    "az functionapp config appsettings delete -g <group> -n <app> --setting-names AzureWebJobsStorage"
  exit 1
fi

if [ "$missing" != "3" ]; then
  echo "::error::identity-based AzureWebJobsStorage needs all three service endpoints"\
    "(__blobServiceUri, __queueServiceUri, __tableServiceUri); found ${missing} of 3"
  exit 1
fi

echo "AzureWebJobsStorage is identity-based with all three service endpoints."

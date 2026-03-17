#!/bin/bash
CODES=("M79" "M625" "M21" "E881" "R234" "M628" "Z760")

for CODE in "${CODES[@]}"; do
    echo "Buscando CID: $CODE"
    mysql -u root manus -e "SELECT id, code, description FROM icd10_codes WHERE code LIKE '$CODE%';"
done

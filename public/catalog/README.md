# Catalog

Static `.partwright.json` files surfaced on the `/catalog` page. Each
entry is a self-contained session payload (schema 1.3+) that imports as
a fresh session when a user clicks its tile.

## Adding a new entry

1. Build the model in the editor and save at least one version.
2. Click `↓ Export` → `Session (.partwright.json)`. In the dialog, **enable
   the Thumbnail option** so the catalog tile gets a real preview image.
3. Drop the downloaded `.partwright.json` into this directory.
4. Add a corresponding entry to `manifest.json`:

   ```json
   {
     "id": "my-model",
     "name": "My Model",
     "description": "Short blurb.",
     "file": "my_model.partwright.json",
     "language": "manifold-js"
   }
   ```

5. Commit. Cloudflare Pages serves these as static assets — no build step
   required.

## Notes

- Files are fetched at runtime by `src/ui/catalog.ts`. Keep them small;
  the embedded thumbnail is a base64 PNG and dominates file size.
- A missing/broken entry renders a disabled placeholder tile rather than
  blocking the whole page.
- Entries without an embedded thumbnail show the hexagon placeholder.

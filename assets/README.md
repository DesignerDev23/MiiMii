# Assets Directory

This directory contains assets used by the receipt generation system.

## Directory Structure

```
assets/
├── fonts/          # Font files for receipt generation
├── images/         # Logo and image files
└── templates/      # Receipt templates (if needed)
```

## Adding Your Logo

1. **Logo Requirements:**
   - Format: PNG (recommended) or JPG
   - Size: Recommended 200x200 pixels or larger (will be scaled down)
   - Background: Transparent or white background works best
   - File name: `logo.png` (or `logo.jpg`)

2. **Placement:**
   - Save your logo file as `assets/images/logo.png`
   - The receipt service will automatically load and display it in the header

## Adding Google Outfit Font

1. **Download Google Outfit Font:**
   - Visit: https://fonts.google.com/specimen/Outfit
   - Click "Download family"
   - Extract the downloaded ZIP file

2. **Required Font Files:**
   - `Outfit-Regular.ttf` - Regular weight font
   - `Outfit-Bold.ttf` - Bold weight font

3. **Placement:**
   - Save both font files in `assets/fonts/` directory
   - The receipt service will automatically register and use them

## File Structure After Setup

```
assets/
├── fonts/
│   ├── Outfit-Regular.ttf
│   └── Outfit-Bold.ttf
├── images/
│   └── logo.png
└── templates/
```

## How It Works

The receipt service (`src/services/receipt.js`) will:

1. **Logo Loading:**
   - Automatically check for `assets/images/logo.png`
   - If found, display it in the receipt header
   - If not found, use a placeholder red circle

2. **Font Registration:**
   - Automatically register Google Outfit fonts on startup
   - Use "Outfit" as the primary font family
   - Fall back to "Arial" if fonts are not available

3. **Receipt Generation:**
   - Generate receipts with your logo and Google Outfit font
   - Create professional-looking transaction receipts
   - Send as images via WhatsApp

## Troubleshooting

- **Logo not showing:** Ensure the file is named exactly `logo.png` and placed in `assets/images/`
- **Font not working:** Ensure both `Outfit-Regular.ttf` and `Outfit-Bold.ttf` are in `assets/fonts/`
- **Fallback behavior:** If assets are missing, the system will use default placeholders and fonts

## Testing

After adding your assets, test the receipt generation by:
1. Making an airtime purchase
2. Checking if the receipt image is sent with your logo and font
3. Verifying the receipt looks professional and branded

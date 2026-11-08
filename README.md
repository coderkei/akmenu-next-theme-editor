# AKTheme Studio

A theme editor for [AKMenu-Next](https://github.com/coderkei/akmenu-next) that runs in your browser.
You can make full AKMenu-Next themes (game covers, music, your own icons and so on) or classic
Wood R4 / Acekard themes, and see exactly how they'll look before you copy them to your SD card.

Nothing gets uploaded. The editor runs entirely on your own computer, and your work is kept in
your browser until you export it.

## Making a theme

When you open the editor you'll be looking at Starlight, one of the themes that comes with
AKMenu-Next. Change whatever you like, or import a theme of your own with **Import zip**.

The settings are on the right, grouped by where things are on the DS. A good place to start is
the **Backgrounds** tab: drop in a picture for each screen and the editor converts it for you
(PNG, JPG and BMP all work). Every other picture in the theme, from the clock digits to the
buttons, lives in the card for the thing it belongs to. If you can't find something, type it
into the search box.

For AKMenu-Next themes you also get:

- your own file list icons, made from any picture
- background music (16-bit WAV or BCSTM)
- extras on the top screen: your DS name, the date, some text, or a small picture

When you're done, press **Export zip** and unzip it into `_nds/akmenunext/ui/` on your SD card.
The editor checks the theme first and tells you about anything the menu would reject or that
won't show up properly.

Made a mistake? **Undo** and **Redo** are in the top bar (Ctrl+Z works too).

## The preview

The preview draws both screens the same way AKMenu-Next does, using the menu's own code as a
reference, so what you see is what you'll get. It isn't just a picture either: you can open
folders, the start menu, Settings and the other windows, switch language, or pretend you're on
a DSi instead of a flashcart.

To move something, like the clock or a button, click it and drag the round handle. Things with
a width and height also get a corner handle for resizing. Click anywhere else when you're done,
or press Esc to put it back. If you'd rather tap the bottom screen like a real touchscreen,
switch **Clicks** to **Use the menu**.

**Screenshot** saves both screens as one picture, handy for sharing your theme.

A few things are stand-ins, since they come from your SD card rather than the theme: game
icons, cover art and your DS name. It's still worth a quick look on real hardware before you
share a theme.

## Running it yourself

```bash
npm install
npm run dev
```

`npm test` runs the tests and `npm run build` puts the site in `dist/`. Pushing to `main`
deploys it to GitHub Pages (set Pages to "GitHub Actions" in the repository settings first).

The [AKMenu-Next docs](https://coderkei.github.io/akmenu-next-docs/guides/themes/) explain the
theme format in more detail.

## Licence

GPL-3.0-or-later, the same as AKMenu-Next. See [LICENSE](LICENSE).

## Developer note

This project was developed with assistance from AI language models. Some source code was generated or refined using AI, with generated code reviewed, modified, and integrated by the project author where appropriate.

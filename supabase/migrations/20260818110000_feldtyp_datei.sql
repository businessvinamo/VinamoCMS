-- =============================================================================
-- Vinamo CMS · 0022 Feldtyp „Datei"
--
-- Eigene Migration, weil Postgres einen neu hinzugefügten Enum-Wert nicht in
-- derselben Transaktion verwenden lässt, in der er angelegt wurde. Die
-- Verwendung steht deshalb in 0023.
--
-- WARUM EIN EIGENER TYP NEBEN „media"
-- -----------------------------------
-- „media" ist ein Bild: Es wird verkleinert, in vier Breiten als WebP abgelegt,
-- EXIF wird entfernt, es hat einen Fokuspunkt und einen Alt-Text. Nichts davon
-- trifft auf eine PDF-Wochenkarte zu. Ein gemeinsamer Typ mit einem Schalter
-- „ist eigentlich ein Bild" wäre genau die Art Sonderfall, die sich später
-- durch die ganze Anwendung zieht.
-- =============================================================================

alter type public.field_type add value if not exists 'file';

-- Und gleich mit: eine echte Uhrzeit.
--
-- Öffnungszeiten lagen bisher als freier Text vor. Eintragbar war damit „09",
-- „9h", „morgens" und „X" -- alles davon landete unverändert auf der
-- Kundenwebsite. Eine Uhrzeit ist ein Datentyp, kein Textfeld.
alter type public.field_type add value if not exists 'time';

-- v146b : descriptions publiques courtes + type de lieu (couleur sur la carte)
-- À appliquer APRÈS supabase/hdar_v146_lieux_decouvrir.sql
-- NON appliquée en prod tant que Jérémie n'a pas validé.
-- Pas dans supabase/data. Aucun e-mail envoyé.

alter table hdar.places add column if not exists venue_kind text;
do $$ begin
  alter table hdar.places drop constraint if exists places_venue_kind_check;
  alter table hdar.places add constraint places_venue_kind_check
    check (venue_kind is null or venue_kind in ('bar', 'club', 'sauna', 'shop', 'exchange', 'cruising'));
end $$;

-- Type fin depuis la prospection (sex-shop, club échangiste, bar cruising…).
update hdar.places p set venue_kind = case o.kind
  when 'club-echange' then 'exchange'
  when 'cruising-bar' then 'cruising'
  when 'other' then 'shop'
  when 'sauna' then 'sauna'
  when 'club' then 'club'
  when 'bar' then 'bar'
  else coalesce(p.venue_kind, case p.kind when 'sauna' then 'sauna' when 'club' then 'club' when 'bar' then 'bar' else 'bar' end)
end
from hdar.outreach o
where o.place_id = p.id;

update hdar.places p set venue_kind = case p.kind
  when 'sauna' then 'sauna'
  when 'club' then 'club'
  when 'bar' then 'bar'
  else 'bar'
end
where p.venue_kind is null and p.kind in ('bar', 'club', 'sauna');

-- Descriptions courtes (langue de la ville) + adresse si connue.
update hdar.places set description = 'Club aan Grote Markt 21, in Antwerpen.', address = coalesce('21 Grote Markt', address) where id = 'd5a3486f-95e9-4469-a4f8-379c36c8faa3';
update hdar.places set description = 'Bar aan Melkmarkt 16-18, in Antwerpen.', address = coalesce('16-18 Melkmarkt', address) where id = '11c5c1f5-5734-4d37-9aa3-4a703d3e98f4';
update hdar.places set description = 'Bar aan Draakplaats 1, in Antwerpen.', address = coalesce('1 Draakplaats', address) where id = '8e57322d-e6a0-432f-8127-200a014ea0e9';
update hdar.places set description = 'Bar aan Nieuwstad 4, in Antwerpen.', address = coalesce('4 Nieuwstad', address) where id = 'f528a537-ce61-4068-be82-c7573df66bc7';
update hdar.places set description = 'Bar aan Kaasrui 1, in Antwerpen Op zoek naar een muziekcafé bij de Grote Markt in Antwerpen? Cabron! Terrasje doen in het centrum van ''t Stad? Feestje in een bar met live optredens?', address = coalesce('1 Kaasrui', address) where id = '46825e5d-60fd-41cb-8937-46664acbad02';
update hdar.places set description = 'Club aan Lange Schipperskapelstraat 11, in Antwerpen Wees te gast bij een van de bekendste clubs van Antwerpen en België. Koop eenvoudig tickets online voor een van de vele events die in onze agenda staan!', address = coalesce('11 Lange Schipperskapelstraat', address) where id = '17aa6689-8a81-489d-a91d-234792687824';
update hdar.places set description = 'Club aan Geulincxstraat 28, in Antwerpen.', address = coalesce('28 Geulincxstraat', address) where id = '9aa6be64-24e4-413e-96b5-9447906bd7eb';
update hdar.places set description = 'Bar aan Grote Pieter Potstraat 21, in Antwerpen.', address = coalesce('21 Grote Pieter Potstraat', address) where id = '95f68891-e008-43a6-ab10-3a278e6b1835';
update hdar.places set description = 'Bar aan Falconrui 79, in Antwerpen.', address = coalesce('79 Falconrui', address) where id = '80efa5a7-54f0-4a68-94d7-65213bbda4af';
update hdar.places set description = 'Club aan Straatsburgdok-Noordkaai 3, in Antwerpen.', address = coalesce('3 Straatsburgdok-Noordkaai', address) where id = '3aea159e-6f30-4d22-8a8a-516d9592de64';
update hdar.places set description = 'Winkel aan Nosestraat 6, in Antwerpen.', address = coalesce('6 Nosestraat', address) where id = '4ab7fe16-7d7d-400e-ad55-c0286f25bc41';
update hdar.places set description = 'Sauna aan Oudenaardsesteenweg 392, in Avelgem Sauna Nautilus: relaxen, ontspannen en genieten voor en onder mannen.', address = coalesce('392 Oudenaardsesteenweg', address) where id = '72a535fd-0959-435c-b54c-8fd9c018728a';
update hdar.places set description = 'De Boys Club is een erotic gay club in Bekkevoort, Diest.', address = coalesce('16 Staatsbaan', address) where id = '342bff8e-b842-4d36-9132-ba63284d33a7';
update hdar.places set description = 'Sauna aan De Lescluzestraat 63, in Berchem.', address = coalesce('63 De Lescluzestraat', address) where id = '84bf4ef5-9909-4ed1-b899-08cf5cd94cc2';
update hdar.places set description = 'Club échangiste à Bruxelles.', address = coalesce(address, address) where id = 'c9a57df8-7e8b-41ad-be8d-c6d16671d177';
update hdar.places set description = 'Bar cruising à Bruxelles.', address = coalesce(address, address) where id = 'c2f2e1a8-87d6-4102-b755-70014c6fefc1';
update hdar.places set description = 'Bar au 6 Place de la Chapelle Ville de Bruxelles, à Bruxelles.', address = coalesce('6 Place de la Chapelle Ville de Bruxelles', address) where id = 'f3a7370d-97e2-415d-8093-78e7d7214093';
update hdar.places set description = 'Bar au 25 Rue du Marché au Charbon, Bruxelles, à Bruxelles.', address = coalesce('25 Rue du Marché au Charbon, Bruxelles', address) where id = '6903bdba-db8f-45ed-aee6-3b661d96be44';
update hdar.places set description = 'Bar au 2 Rue du Lombard, Bruxelles, à Bruxelles.', address = coalesce('2 Rue du Lombard, Bruxelles', address) where id = 'a4f35fb2-5fba-4d15-9638-55018ebd5a18';
update hdar.places set description = 'Club au 116 Rue du Marché aux Herbes Ville de Bruxelles, à Bruxelles.', address = coalesce('116 Rue du Marché aux Herbes Ville de Bruxelles', address) where id = '5c3ab9eb-f715-4620-b436-f19531ff6217';
update hdar.places set description = 'Club à Bruxelles.', address = coalesce(address, address) where id = '14a7d504-d9e2-491d-a577-bd65e2711ae1';
update hdar.places set description = 'Bar au Bruxelles (Brussel), à Bruxelles The Crazy Circle : Le bar lesbien permanent à Bruxelles. Lieu féministe, queer ouvert à toute la Communauté LGBTQI+ et leurs ami.e.s. Concerts - Femme Jam - Karaoke - DJ Set - Cabaret - Jeux de société - Rencontres.', address = coalesce('Bruxelles (Brussel)', address) where id = '51caa25e-fffd-4ffa-a24e-60bac0eccdea';
update hdar.places set description = 'Bar au 40 Rue du Marché au Charbon Ville de Bruxelles, à Bruxelles.', address = coalesce('40 Rue du Marché au Charbon Ville de Bruxelles', address) where id = 'daca629e-035f-45c8-9346-f4b5477b1efa';
update hdar.places set description = 'Club au Rue Blaes Bruxelles - Brussels, à Bruxelles.', address = coalesce('Rue Blaes Bruxelles - Brussels', address) where id = '77fdd838-6d8d-48c9-aa9a-513f52f488de';
update hdar.places set description = 'Bar au 5 Rue du Marché au Charbon Ville de Bruxelles, à Bruxelles.', address = coalesce('5 Rue du Marché au Charbon Ville de Bruxelles', address) where id = '44f4e774-8679-45fa-807c-1a00e012f27e';
update hdar.places set description = 'Bar au 52 Rue des Pierres Ville de Bruxelles, à Bruxelles.', address = coalesce('52 Rue des Pierres Ville de Bruxelles', address) where id = '8fa1acb4-fa16-40cb-b7d2-20976b2ce758';
update hdar.places set description = 'Bar au 2a Petite rue au Beurre Ville de Bruxelles, à Bruxelles Best gay bar in Brussels, Belgium.', address = coalesce('2a Petite rue au Beurre Ville de Bruxelles', address) where id = '24aae40a-45f2-4ddd-a6dd-2cf871010fe2';
update hdar.places set description = 'Bar au 32 Rue du Marché au Charbon Ville de Bruxelles, à Bruxelles.', address = coalesce('32 Rue du Marché au Charbon Ville de Bruxelles', address) where id = '28c62461-f210-4d84-a6e0-caf35334b8d8';
update hdar.places set description = 'Sauna au 10 Rue Van Orley Ville de Bruxelles, à Bruxelles.', address = coalesce('10 Rue Van Orley Ville de Bruxelles', address) where id = 'cda7232b-1c18-4f2c-bb27-e8df32ba6627';
update hdar.places set description = 'Bar au 27 Rue du Marché au Charbon Ville de Bruxelles, à Bruxelles.', address = coalesce('27 Rue du Marché au Charbon Ville de Bruxelles', address) where id = 'a9707639-0f5a-4acb-a41b-c7d887a845a3';
update hdar.places set description = 'Bar au 38 Place de la Digue, à Charleroi.', address = coalesce('38 Place de la Digue', address) where id = '5d92fc9e-0060-4ac4-8203-971a954819b0';
update hdar.places set description = 'Bar au 9 Rue de France, à Charleroi.', address = coalesce('9 Rue de France', address) where id = '0bcdaf3b-4a3c-483d-815b-0d67832b83dc';
update hdar.places set description = 'Bar au 11 Rue de la Casquette, à Liège.', address = coalesce('11 Rue de la Casquette', address) where id = '4ccd7bd6-4940-4d6c-b4b1-3315d45b2850';
update hdar.places set description = 'Bar au 31 Place du Marché, à Liège.', address = coalesce('31 Place du Marché', address) where id = 'cdd117b7-dde8-45ce-a033-3c371d299dcc';
update hdar.places set description = 'Sauna à Liège Le 139 - endroit de rencontre à Ans. Détente et convivialité dans un cadre chaleureux. Venez profiter de nos installations.', address = coalesce(address, address) where id = '040b8310-5585-4a98-a1cf-e896a8d55867';
update hdar.places set description = 'Sauna au 422 Avenue Émile Herman, à Manage Sauna hammam gay ,parking à l.', address = coalesce('422 Avenue Émile Herman', address) where id = '3140a6a5-e70b-4c8d-9010-38fbd5a7ed8c';
update hdar.places set description = 'Sauna in Basel Sauna Sunnyday, Basel – Sauna Sunnyday in Basel.', address = coalesce(address, address) where id = '2062c479-0c29-4a87-913e-470bd7ea2253';
update hdar.places set description = 'Sauna in der Brunnmattstrasse 21, in Bern.', address = coalesce('21 Brunnmattstrasse', address) where id = 'fb8160cb-c53f-45ef-95eb-47618626d8a1';
update hdar.places set description = 'Bar in der Gerechtigkeitsgasse 53, in Bern.', address = coalesce('53 Gerechtigkeitsgasse', address) where id = '94efc78c-2bdc-4ad8-82bb-ad026b7c1ad4';
update hdar.places set description = 'Sauna in der Länggassstrasse 65, in Bern Entdecke die Gay Sauna Sundeck in Bern: Sauna, Dampfbad, Whirlpool, Bar und Dachterrasse. An den Mixed Days offen für alle Geschlechter. Plane deinen Besuch.', address = coalesce('65 Länggassstrasse', address) where id = 'd31e37ec-aa0a-4815-a4ec-e8cc73757021';
update hdar.places set description = 'Sauna au 3 Rue de l''Est, à Genève.', address = coalesce('3 Rue de l''Est', address) where id = 'a2d3089c-c296-4d18-93fd-e1c62018aeea';
update hdar.places set description = 'Bar au 34 Avenue de Frontenex, à Genève.', address = coalesce('34 Avenue de Frontenex', address) where id = '3cb93fdc-53d8-48b2-abb1-242d224194ef';
update hdar.places set description = 'Sauna au 7&9 avenue Tivoli, à Lausanne.', address = coalesce('7&9 avenue Tivoli', address) where id = '8e3c1ffb-51dd-457f-8732-81eac7585b42';
update hdar.places set description = 'Bar in der Metzgergasse 3, in Zürich.', address = coalesce('3 Metzgergasse', address) where id = '048a2ef8-4cf4-4173-8062-12a5d89f77a3';
update hdar.places set description = 'Sauna in Zürich Die grösste Gay und Bi-Männer Sauna auf 500 m2 in der Zentralschweiz.', address = coalesce(address, address) where id = '32979bf4-192a-4439-b9a8-df9d5be2f937';
update hdar.places set description = 'Club in der Spitalgasse 5, in Zürich.', address = coalesce('5 Spitalgasse', address) where id = 'ec08551e-cfa5-4c4a-831e-7a70d390fa6b';
update hdar.places set description = 'Bar in der Spitalgasse 14, in Zürich.', address = coalesce('14 Spitalgasse', address) where id = '1de582ce-0092-4786-8f83-64ba4fee5ca3';
update hdar.places set description = 'Sauna in der Mühlegasse 11, in Zürich Entdecke den Paragonya Wellness Club in Zürich. Auf über 600m² bieten wir eine moderne Gay Sauna, Dampfbad, Whirlpool und Bar an der Mühlegasse 11 im Herzen der Altstadt.', address = coalesce('11 Mühlegasse', address) where id = 'a0758cbc-4457-4863-895a-b5d89e23b911';
update hdar.places set description = 'Sauna in der Brauerstrasse 16, in Zürich.', address = coalesce('16 Brauerstrasse', address) where id = 'd3ee1703-ca21-4686-8328-be68b17592bf';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '7d0c741e-d45f-420d-9b19-3daa4e5b4634';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '7dad685d-d519-4bdd-adb1-e75d2513e3e8';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '22b06aaa-6374-45c5-92b5-6fb17acd1221';
update hdar.places set description = 'Bar in Berlin Die queere Cocktailbar Im schwulen Nollendorf-Kiez - auf zur Party ins Blond und sich austoben, entspannen und vom Team der Bar verwöhnen lassen.', address = coalesce(address, address) where id = '2aff01be-4e0c-4bbb-8ac0-bc4436b14d45';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '8596679a-daee-4bd4-b5cd-daaa2103c59a';
update hdar.places set description = 'Laden in Berlin.', address = coalesce(address, address) where id = 'cd54ae88-7ee4-46db-9bcd-6c10a5dcd1d1';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '17c0e961-8a88-46fa-994e-e8051d2dfc51';
update hdar.places set description = 'Laden in Berlin.', address = coalesce(address, address) where id = '263ee654-8a7c-4f06-a15e-131732387c66';
update hdar.places set description = 'Sauna in Berlin.', address = coalesce(address, address) where id = '6a6eb090-7048-4acb-99c5-65a6b739e38d';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = 'c957593c-0b38-4939-ae29-a2760d7203df';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '31b4bb9c-f049-4b0c-9d0e-00dc7dc8e1d9';
update hdar.places set description = 'Club in Berlin.', address = coalesce(address, address) where id = '14596d13-db2c-431d-bf52-a1065e909cbc';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '9d5d69c4-66f0-427c-8de2-e8bbb50506d8';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '46f38a8a-736f-4103-9fc9-dfce6f37fbe8';
update hdar.places set description = 'Bar in Berlin Hier treffen sich Menschen unterschiedlichsten Alters und unabhängig von ihrer Sexualität, um ungezwungen zu quatschen und zu trinken.', address = coalesce(address, address) where id = 'fa3c388f-78f9-47a8-b478-7d981659178c';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '17702148-f4aa-4357-b51c-358836d12939';
update hdar.places set description = 'Club in Berlin.', address = coalesce(address, address) where id = 'fdd8c4de-7882-4eff-9ac2-12d867799024';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '4519354e-33af-4071-a910-40f411850338';
update hdar.places set description = 'Laden in Berlin.', address = coalesce(address, address) where id = '65fd7309-8a3f-47e4-806e-63504cd8287b';
update hdar.places set description = 'Laden in Berlin.', address = coalesce(address, address) where id = '3347592b-8b30-463e-a990-cea0fe8bd397';
update hdar.places set description = 'Bar in Berlin Möbel-Olfe: Herzlich willkommen.', address = coalesce(address, address) where id = '415a9d6b-7ce1-4db6-a9bc-a3649b8c5cb8';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '9e49e066-49f1-4eb2-9858-8422af46bfb5';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = 'd1525f25-8aaa-484c-90c4-4472dbd25ec8';
update hdar.places set description = 'Laden in Berlin.', address = coalesce(address, address) where id = '6ae464df-7be0-4d9a-b28d-438dbd0c9652';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = 'ef58cc0a-c5ec-4851-b3e1-ceab2d7f4220';
update hdar.places set description = 'Laden in Berlin.', address = coalesce(address, address) where id = '9db6cafd-442d-4f42-af1a-42ae42fc4f26';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = 'f6f0cb81-57f2-41ce-8073-59a90e3d1599';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '6201e9ed-b88a-455a-968a-be73e156571b';
update hdar.places set description = 'Das Silverfuture hat 2007 eröffnet und ist seitdem ein Treffpunkt für Kings, Queens und Criminal Queers und ihre Freund*innen aus Berlin und der ganzen Welt.', address = coalesce(address, address) where id = '3e65abdb-72fb-4705-96d3-c479d2b617ed';
update hdar.places set description = 'Bar in Berlin Beratungs-, Informations- und Kommunikations-Zentrum für Lesben, Schwule, Bisexuelle, Trans* und Inter*.', address = coalesce(address, address) where id = 'dcbbb171-aa28-4b8e-a7e5-12f60785b68d';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = 'b84f1a2d-0371-4ef6-9cf5-20b065ea93f9';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = '5c383f18-0704-4fac-9b13-c3e191cd4088';
update hdar.places set description = 'Bar in Berlin.', address = coalesce(address, address) where id = 'aae51e7a-f6fc-4cbe-be22-7e320ce04542';
update hdar.places set description = 'Club in Bremen.', address = coalesce(address, address) where id = '96b16663-d357-4f86-8192-d8b2785fd7fa';
update hdar.places set description = 'Bar in Bremen.', address = coalesce(address, address) where id = 'd43d335c-4a51-4c0b-868e-2d58dfac356c';
update hdar.places set description = 'Bar in Frankfurt am Main.', address = coalesce(address, address) where id = 'e49cd2c8-036b-4cec-a696-d33baffd81a3';
update hdar.places set description = 'Bar in Frankfurt am Main.', address = coalesce(address, address) where id = '602d682d-4e90-4667-b729-2e81112f6689';
update hdar.places set description = 'Bar in Frankfurt am Main LUCKYS Frankfurt / Bar & Lounge.', address = coalesce(address, address) where id = '9d29d7a8-7087-4835-807f-302490dc475d';
update hdar.places set description = 'Die Bellini Bar ist längst eine Institution im Herzen von Hamburg St. Georg, unweit der Langen Reihe. Schwulenbar, Lesbenbar, Hetero-freundlich - Jedermann ist herzlich willkommen.', address = coalesce(address, address) where id = 'fc2fabcf-a208-4465-9a5d-fc4b772d135e';
update hdar.places set description = 'Bar in Hamburg Frühstück - Mittagstisch-Deutsche Hausmannskost - Kaffee & Kuchen oder gemütlich einen Cocktail zum Feierabend?', address = coalesce(address, address) where id = '515e304d-6018-4591-9903-66a367c19774';
update hdar.places set description = 'Bar in Hamburg.', address = coalesce(address, address) where id = '52985d19-6ec4-4d79-b8f0-d1331b818375';
update hdar.places set description = 'Dragon Sauna Hamburg - Norddeutschlands beliebteste Gay-Sauna.', address = coalesce(address, address) where id = '4190a0eb-31a8-4d5c-9263-7b0b81fd6fff';
update hdar.places set description = 'Bar in Hamburg.', address = coalesce(address, address) where id = '8ab35755-16ce-46eb-ad37-8b447aaca45c';
update hdar.places set description = 'Jetzt musst du nur noch zu uns nach Hamburg-St. Georg finden, denn wir sind mehr als nur eine Schwulen Gay Bar. LGBTQIA+ Community in Hamburg.', address = coalesce(address, address) where id = 'e77c77c4-4526-4b70-87cb-eefbe7cfb602';
update hdar.places set description = 'Bar in Hamburg.', address = coalesce(address, address) where id = '567a9e3e-8adb-4f68-bc11-ca016a382257';
update hdar.places set description = 'Bar in Hamburg Mitten auf St. Pauli: unsere gemütliche Schankwirtschaft für die queere Community, die Nachbarschaft und alle, die lieber gemeinsam trinken als blöd gucken.', address = coalesce(address, address) where id = 'd13b3ff6-94c7-4041-b409-7097f8403e61';
update hdar.places set description = 'Bar in Hamburg.', address = coalesce(address, address) where id = '4a71f36f-3fe8-4f80-8777-71ad0002d855';
update hdar.places set description = 'Laden in Herten.', address = coalesce(address, address) where id = 'f42338b1-9c93-4709-a78e-97b18656cee1';
update hdar.places set description = 'Bar in Köln.', address = coalesce(address, address) where id = '270d4c66-c904-4662-9d4b-6234409f0fb3';
update hdar.places set description = 'Club in Köln.', address = coalesce(address, address) where id = 'f7f21825-a4f7-4d53-bae3-9551de83df94';
update hdar.places set description = 'Bar in Köln.', address = coalesce(address, address) where id = 'c1e403df-70f9-4ea0-8eda-2ac13d5c59d9';
update hdar.places set description = 'Club in Köln.', address = coalesce(address, address) where id = '2e729aaf-1fb3-445b-a424-01e87a0a0ebb';
update hdar.places set description = 'Bar in Köln.', address = coalesce(address, address) where id = 'cfcbbb98-6a34-43f4-bd96-687083f7f3a6';
update hdar.places set description = 'Bar in Köln.', address = coalesce(address, address) where id = '591c4fa9-9327-4d99-aa3f-6ca6b37619a7';
update hdar.places set description = 'Bar in Köln.', address = coalesce(address, address) where id = '1c30567e-3974-4c96-bb01-595a2fcbac85';
update hdar.places set description = 'Club in Köln Nachtflug – Unique Nightlife Experience.', address = coalesce(address, address) where id = '32ae8f22-773b-4b4e-af78-b82fb51b682f';
update hdar.places set description = 'Phoenix Sauna Köln - Die Sauna für Männer und Jungs in Köln.', address = coalesce(address, address) where id = 'd34c6b55-39bf-4ec3-b801-90d69ddd86b2';
update hdar.places set description = 'Sauna in Köln.', address = coalesce(address, address) where id = '6de5de98-f098-46ff-870e-a2dd8a9f2a2d';
update hdar.places set description = 'Bar in Köln.', address = coalesce(address, address) where id = '038b7e2c-6736-4790-8bb3-e61a5345011d';
update hdar.places set description = 'Sauna in Leipzig.', address = coalesce(address, address) where id = '5cd4b6de-fa32-4690-bbe9-43a023cb42d7';
update hdar.places set description = 'Bar in München.', address = coalesce(address, address) where id = '8124e4b0-7f07-4bb6-9dd7-6abde00aed82';
update hdar.places set description = 'Bar in München Willkommen im NIL dem Zuhause smarter Jungs ...und Mädels! Wir heißen hier Gäste aller Altersgruppen und jeder Couleur willkommen!', address = coalesce(address, address) where id = 'b749348c-bdad-43e7-8d41-365bbc0e2b93';
update hdar.places set description = 'Club in München.', address = coalesce(address, address) where id = '742039ac-1bae-4eb1-8f14-1c92d4f0ef15';
update hdar.places set description = 'Willkommen in der Deutschen Eiche, dem traditionsreichen Treffpunkt Münchener Kulturschaffender und der schwul-lesbischen Szene. Direkt im Herzen Münchens beim Gärtnerplatz.', address = coalesce(address, address) where id = '1c368a95-a746-4927-9873-d5f12292d1fd';
update hdar.places set description = 'Bar in Nürnberg.', address = coalesce(address, address) where id = 'ccee5290-d4b5-4e83-adae-15d18cae76ea';
update hdar.places set description = 'Herzlich willkommen im Eagle Stuttgart - Eurer GAY Institution im Herzen Stuttgarts!', address = coalesce(address, address) where id = 'b3b5cbc3-19dd-446a-81ed-d11a9192ac65';
update hdar.places set description = 'Tienda en Barcelona.', address = coalesce(address, address) where id = '354e8a2c-94eb-431c-a720-2864c4ea3cc4';
update hdar.places set description = 'Las mejores discos y fiestas gay & lesbian de Barcelona. Punto BCN, DMEN''s Gay Bar, Arena Experience, Arena Madre & Classic, Aire Chicas, Safari Disco Club.', address = coalesce(address, address) where id = 'f8f8398b-dd99-4365-b035-e52669c28044';
update hdar.places set description = 'Club en Barcelona.', address = coalesce(address, address) where id = '65301e3e-eb93-469f-8444-9a0df876b651';
update hdar.places set description = 'Tienda en Barcelona Sex shop online con juguetes eróticos de LELO, Satisfyer y Womanizer. Envío discreto en 24/72 h, gratis desde 60 € y devolución gratis en 1 año.', address = coalesce(address, address) where id = '0d188d4b-80be-44ec-80c0-6790d5730eb6';
update hdar.places set description = 'Bar en Barcelona.', address = coalesce(address, address) where id = 'aee861c2-7417-417b-81f6-b29af8009847';
update hdar.places set description = 'Boxer Barcelona. Find your inner X.', address = coalesce(address, address) where id = '52fc3d5b-95a1-4d8f-867b-7d362172a143';
update hdar.places set description = 'Bar en Barcelona.', address = coalesce(address, address) where id = '63e868c0-2f76-4c5d-a4dd-1ec5df043861';
update hdar.places set description = 'Sauna Gay Barcelona. Sauna Bruc es el punto de encuentro para hombres de Barcelona.', address = coalesce(address, address) where id = 'd2417a23-f955-4c9c-a1da-11739218ed95';
update hdar.places set description = 'Bar en Barcelona.', address = coalesce(address, address) where id = 'b8523546-5de2-423b-b8ff-f95436d01b70';
update hdar.places set description = 'Bar Queer Goth Barcelona - ¡El bar más oscuro y divertido de Barcelona!', address = coalesce(address, address) where id = 'e1f34fcf-3626-4aba-a82f-019d0d72c947';
update hdar.places set description = 'Bar en Barcelona.', address = coalesce(address, address) where id = 'c37f308b-d231-48f8-b15e-ffb654f9ddfd';
update hdar.places set description = 'Bar en Barcelona.', address = coalesce(address, address) where id = 'fefc5d1a-3aa3-4d8d-bfde-c2668abd07b0';
update hdar.places set description = 'Bar en Barcelona.', address = coalesce(address, address) where id = '92fa7566-fd8a-4c2c-891e-7f191661409c';
update hdar.places set description = 'Night Barcelona Gay bar. Open daily 6pm to 3am. 100% Gay cruising bar.', address = coalesce(address, address) where id = '44175f05-ab99-4b49-a1e5-3e2bcd360490';
update hdar.places set description = 'Bar en Barcelona.', address = coalesce(address, address) where id = 'd0b3c667-58e2-4913-9ad8-d67c8a87f029';
update hdar.places set description = 'Club en Barcelona.', address = coalesce(address, address) where id = 'fc1a783f-995e-4cce-ab17-13115b8d6407';
update hdar.places set description = 'Sauna gay Barcelona - Sauna masculina muy cerca del centro de Barcelona. Tenemos las instalaciones más modernas a tu disposición.', address = coalesce(address, address) where id = '9562e4f4-27e7-4030-a638-4175296cf03b';
update hdar.places set description = 'Bar en Barcelona.', address = coalesce(address, address) where id = '8a91b14f-8323-4808-828a-938c596f7dea';
update hdar.places set description = 'Bar en Barcelona.', address = coalesce(address, address) where id = 'bcd37e10-1120-477b-ac76-0f2bca6155c9';
update hdar.places set description = 'Bar en Barcelona.', address = coalesce(address, address) where id = '00d369d6-c328-41b9-be93-c9e06d8ccf88';
update hdar.places set description = 'Bar en Ibiza.', address = coalesce(address, address) where id = 'f5a0713f-de13-442d-98c8-d1ec3314ecb2';
update hdar.places set description = 'Bar en Ibiza.', address = coalesce(address, address) where id = '9dbd6487-2d35-4af3-8fba-105e0cd87dd4';
update hdar.places set description = 'Bar en Ibiza.', address = coalesce(address, address) where id = 'bd994f56-deb7-4d6a-8893-2eba188f85cc';
update hdar.places set description = 'Bar en Madrid.', address = coalesce(address, address) where id = '2fdb00ab-6d07-47a4-8be6-1f2064bc98df';
update hdar.places set description = 'Bar en Madrid.', address = coalesce(address, address) where id = '7755562b-f159-4dc4-ac3c-e8e5400daca3';
update hdar.places set description = 'Bar en Madrid.', address = coalesce(address, address) where id = 'ddc0d5c4-1a5e-4c1b-bd98-12df5189d7b4';
update hdar.places set description = 'Bar en Madrid.', address = coalesce(address, address) where id = 'a71457bc-6a4a-40ab-a7b3-b629ba488d0f';
update hdar.places set description = 'Club en Madrid.', address = coalesce(address, address) where id = '47d91f88-c63e-4559-a3a7-f52d724d64b0';
update hdar.places set description = 'Hot bears Madrid | Hot bears Madrid.', address = coalesce(address, address) where id = '681e4239-333a-4f4b-9df6-69d6fee2d0b5';
update hdar.places set description = 'Bar en Madrid.', address = coalesce(address, address) where id = '372620a8-193f-4497-91a3-00574d65e68a';
update hdar.places set description = 'Bar en Madrid.', address = coalesce(address, address) where id = '169048d7-6561-41ca-b2a5-33e4a1335d40';
update hdar.places set description = 'Club en Madrid.', address = coalesce(address, address) where id = '96010a1c-77a6-41ee-aeeb-3e75a6ba5091';
update hdar.places set description = 'Sauna Beach Madrid: Relájate y diviértete en nuestra exclusiva sauna gay, con instalaciones de primera y disco ¡Ambiente único!', address = coalesce(address, address) where id = '399ee177-01cc-455e-9cb6-4d26f83b43ac';
update hdar.places set description = 'Sauna en Madrid.', address = coalesce(address, address) where id = 'ad1a4f0a-f045-4195-be08-44492452ff40';
update hdar.places set description = 'Bar en Madrid.', address = coalesce(address, address) where id = '1b9aa90c-4297-4f5b-b4fd-3e1cd945b937';
update hdar.places set description = 'Sauna en Madrid Octopus Sauna – SAUNA OCTOPUS.', address = coalesce(address, address) where id = '8650a89f-a035-4ade-8c60-51ff4ef4e2fe';
update hdar.places set description = 'Sauna Paraíso es la sauna gay para jóvenes en Madrid donde conocer gente como tu. Fin de semana y fiestas: 24H. Seguridad y diversión.', address = coalesce(address, address) where id = '241af233-798b-4888-9bb2-825bacd79af4';
update hdar.places set description = 'Bar en Madrid.', address = coalesce(address, address) where id = '6db283bd-5987-476b-9194-09f0413c68e4';
update hdar.places set description = 'Bar en Madrid.', address = coalesce(address, address) where id = 'ddb74545-6f5c-4bfd-861b-773326c0fb96';
update hdar.places set description = 'Bar en Maspalomas.', address = coalesce(address, address) where id = '47138d0c-8022-4f70-9d74-db39105ee478';
update hdar.places set description = 'Bar en Maspalomas.', address = coalesce(address, address) where id = 'c45c07ce-d14b-4f91-931c-f861d15ec868';
update hdar.places set description = 'Tienda en Maspalomas.', address = coalesce(address, address) where id = '644d61d9-cfd8-4d24-ad75-b7358a607ca3';
update hdar.places set description = 'Club en Maspalomas.', address = coalesce(address, address) where id = '0e81b2e5-7e91-4cb4-9dc1-8cf1616cfc84';
update hdar.places set description = 'Bar en Maspalomas.', address = coalesce(address, address) where id = '3a8469b6-e830-4604-bc18-8bfca47f911a';
update hdar.places set description = 'Sauna en Maspalomas Descubre Sauna Corpus, un espacio social masculino con sauna moderna y bar de diseño.', address = coalesce(address, address) where id = '9933bdee-b6d0-4674-8f1a-3cc82de3b9b1';
update hdar.places set description = 'Bar en Maspalomas.', address = coalesce(address, address) where id = 'f253e9ad-5631-42e8-a4d0-224901455d5b';
update hdar.places set description = 'Bar en Maspalomas.', address = coalesce(address, address) where id = '62e0a38c-e011-4806-a87c-44c168a9b8da';
update hdar.places set description = 'Bar en Maspalomas.', address = coalesce(address, address) where id = 'e675eb3d-72a8-41fb-a629-6e7d7d5cd58b';
update hdar.places set description = 'Bar en Maspalomas drinks - cocktail bar wunderbar gran canaria spain - eurovision night - retro night- gay bar, shop.', address = coalesce(address, address) where id = '0c02502a-4c0d-4ab9-ba74-44c50b246597';
update hdar.places set description = 'Bar en Palma de Mallorca.', address = coalesce(address, address) where id = 'f966033d-812e-4b37-95f3-0401e159a1ed';
update hdar.places set description = 'Bar en San Bartolomé de Tirajana.', address = coalesce(address, address) where id = '3ea9f225-04c1-4830-ba12-646dbbabd5b1';
update hdar.places set description = 'Sauna en Sevilla.', address = coalesce(address, address) where id = 'c7e8f415-14e6-4a44-853a-881edfda3b4f';
update hdar.places set description = 'Sauna gay premium en el corazón de Sevilla. Más de 800 m² con sauna seca, vapor, jacuzzi, lounge bar y zona chill out. Abierto 24h los fines de semana.', address = coalesce(address, address) where id = '243999dc-02d9-4c9e-973f-b28f5f0bba69';
update hdar.places set description = 'Bar en Torremolinos.', address = coalesce(address, address) where id = '9a2a6e4b-d112-4e0d-a042-6053b1b579cb';
update hdar.places set description = 'La tentación vive aquí Déjate llevar, explora sin límites y disfruta cada instante. El placer empieza cuando cruzas la puerta. ¡Bienvenidos a Sauna Apolo, tu refugio de relax en Torremolinos, Málaga!', address = coalesce(address, address) where id = '77e400a0-59b4-4ca1-a32f-4ab561fee72a';
update hdar.places set description = 'BALOO BAR LOUNGE - Torremolinos | Spanish cuisine near me.', address = coalesce(address, address) where id = 'd6aee498-8ac6-46fd-a637-fd2417aedb22';
update hdar.places set description = 'Bar en Torremolinos.', address = coalesce(address, address) where id = '86b29dbc-7205-4071-bbb1-72dbe5ab1ca2';
update hdar.places set description = 'Bar en Torremolinos.', address = coalesce(address, address) where id = 'd3508bd3-f86c-4ea7-8ff8-eae67ae73371';
update hdar.places set description = 'Bar en Torremolinos.', address = coalesce(address, address) where id = '341e0152-ae4d-490f-b012-1857eac006f7';
update hdar.places set description = 'Club en Torremolinos.', address = coalesce(address, address) where id = '5a9b0676-cfb8-4c58-9f1f-b713ae0cacfe';
update hdar.places set description = 'Discoteca Gay Club Deseo 54 Valencia.', address = coalesce(address, address) where id = 'caccf4b6-c350-45dc-b350-dd83f76817ff';
update hdar.places set description = 'Club en Valencia.', address = coalesce(address, address) where id = 'a7222436-514a-4b75-b854-b267b1b17785';
update hdar.places set description = 'Sauna au 164 avenue des graviers, à Abrest.', address = coalesce('164 avenue des graviers', address) where id = 'd793be08-5338-4bef-a391-da2985bd1ea8';
update hdar.places set description = 'Découvrez le SPA’T, un spa pour hommes à Aix-en-Provence avec sauna, hammam, jacuzzi et espace sensoriel. Un lieu dédié au bien-être et à la détente.', address = coalesce('724 Avenue du Club Hippique', address) where id = '2d33c074-7c58-4851-9794-b238f8a4e451';
update hdar.places set description = 'Sauna au 4 passage Théodore Lemaître, à Alençon.', address = coalesce('4 passage Théodore Lemaître', address) where id = '8a565dda-3923-47ad-bd80-8b60cc7c2c7e';
update hdar.places set description = 'Sauna au 177 route de Paris, à Amfreville la Mivoie.', address = coalesce('177 route de Paris', address) where id = '24fd1945-061e-464d-bc4d-2b1e4b3ebe49';
update hdar.places set description = 'Club au 61 Rue Beaurepaire, à Angers.', address = coalesce('61 Rue Beaurepaire', address) where id = '2c7fb268-0f08-4880-9050-0c7335081ce2';
update hdar.places set description = 'Bar au Quai du Docteur Dervaux, à Asnières-sur-Seine Rosa Bonheur à l''Ouest s’installe à Asnières au Port Bas, sur les bords de Seine en 2017. La guinguette vous accueille toute l''année.', address = coalesce('Quai du Docteur Dervaux', address) where id = '901a4003-3b24-4db9-a11f-702a2a90226a';
update hdar.places set description = 'Sauna à Auxerre Accueil | Sauna Icaunais Mixte.', address = coalesce(address, address) where id = 'c29e575e-c4c0-492e-b99b-a6b064374c31';
update hdar.places set description = 'Club au 24 Chemin de l''Ile de Piot, à Avignon.', address = coalesce('24 Chemin de l''Ile de Piot', address) where id = '15126242-648e-44a2-b43a-dbc9848a6b00';
update hdar.places set description = 'Sauna au Rue Thalès, à Aytré Accueil - Sauna Gay & Libertin à La Rochelle - L''Atlantis & Périgueux - Le Cantou.', address = coalesce('Rue Thalès', address) where id = '908d1b20-1430-455b-911e-005ccf9a7000';
update hdar.places set description = 'Club au 56 Route de Lavaur, à Balma Salle événementielle de 2 500 m² à Toulouse. 5 espaces modulables, ingénierie technique de référence, accompagnement sur-mesure. Événements corporate et live.', address = coalesce('56 Route de Lavaur', address) where id = '8bcde763-596e-4e31-bb46-5728361b5537';
update hdar.places set description = 'Sauna au 70 boulevard Alsace Lorainne, à Bayonne.', address = coalesce('70 boulevard Alsace Lorainne', address) where id = 'e034dedf-1319-4347-8569-c3b122359560';
update hdar.places set description = 'Sauna au 20 boulevard Santraille, à Bergerac.', address = coalesce('20 boulevard Santraille', address) where id = '4e32f2eb-e42c-43fa-82e8-01d557fe47b5';
update hdar.places set description = 'Bar au 11 Boulevard Dubus, à Bernay.', address = coalesce('11 Boulevard Dubus', address) where id = 'a4756ae4-8d5e-4c34-af8d-4d6fca88baf1';
update hdar.places set description = 'Bar au 1 rue Charles Fourier 25000, à Besançon.', address = coalesce('1 rue Charles Fourier 25000', address) where id = 'c08297c3-0880-4f4b-9f60-e7e8773b3bdc';
update hdar.places set description = 'Sauna gay de 350 m² à 100 m de la gare de Béziers et à 20 minutes du Cap d''Agde : jacuzzi, hammam, cabines, salons, bar et soirées à thème (bears, naturiste, fluo, no light…). Hygiène et prévention suivies, accès réservé aux majeurs.', address = coalesce(address, address) where id = '91aec9c1-adc0-476f-8241-3dd6918551ee';
update hdar.places set description = 'Bar au 36 Avenue de Verdun, à Biarritz.', address = coalesce('36 Avenue de Verdun', address) where id = 'd512f910-47c7-4246-bcf5-fc3bea19e1ef';
update hdar.places set description = 'Club au 1 Rue du Mouton, à Blois.', address = coalesce('1 Rue du Mouton', address) where id = '0e8b6fe9-1971-4393-be02-58eb2f68483b';
update hdar.places set description = 'Bar à Bordeaux.', address = coalesce(address, address) where id = 'fe0218d7-db49-4462-9571-07ec30db390a';
update hdar.places set description = 'Bar au Place Pierre Renaudel, à Bordeaux.', address = coalesce('Place Pierre Renaudel', address) where id = 'ea65c46c-9af8-44a9-b1e6-de43735242d7';
update hdar.places set description = 'Bar à Bordeaux.', address = coalesce(address, address) where id = '38c653d2-128e-442e-9257-3195883521f7';
update hdar.places set description = 'Bar au 3 Rue Premeynard, à Bordeaux Linktree. Make your link do more.', address = coalesce('3 Rue Premeynard', address) where id = '8e707b29-d91d-40c9-be97-e4c3bcf123fc';
update hdar.places set description = 'Bar au 43 Rue Lafaurie de Monbadon, à Bordeaux.', address = coalesce('43 Rue Lafaurie de Monbadon', address) where id = '8727aa92-d841-4db7-9794-30179d2e359e';
update hdar.places set description = 'Pulp Club est un restaurant type bistrot et bar à cocktails situé à Bordeaux Saint-Michel. Profitez de concerts live tous les soirs du mardi au samedi !', address = coalesce('30 Rue des Vignes', address) where id = '7e83643c-4cc5-4321-ad94-f5347eab91ed';
update hdar.places set description = 'Bar au 73 Cours de l''Argonne, à Bordeaux.', address = coalesce('73 Cours de l''Argonne', address) where id = '36193de7-a9aa-4795-95b5-b02623477aea';
update hdar.places set description = 'Club échangiste à Bréal-sous-Montfort.', address = coalesce(address, address) where id = '3430b55f-7144-4005-9f3b-56d8ebebab35';
update hdar.places set description = 'Bar au 193 Rue Jean Jaurès, à Brest.', address = coalesce('193 Rue Jean Jaurès', address) where id = '01f7437b-288d-4bf9-87ce-ee2957d39adf';
update hdar.places set description = 'Bar au 16 rue Varignon 14000, à Caen.', address = coalesce('16 rue Varignon 14000', address) where id = 'bf01e9a4-75f6-493d-9bd0-e34b87b495dd';
update hdar.places set description = 'Bar au 51 Rue Saint-Michel, à Caen.', address = coalesce('51 Rue Saint-Michel', address) where id = '23e6878e-d34e-4214-b50d-b670c3b08110';
update hdar.places set description = 'Bar à Caen.', address = coalesce(address, address) where id = '7d59f089-6675-4db1-a155-7155f375af55';
update hdar.places set description = 'Bar au 4 Rue Jean de Vienne, à Calais.', address = coalesce('4 Rue Jean de Vienne', address) where id = '8bb73a13-f0be-4365-b069-c002670e24f6';
update hdar.places set description = 'Sauna au 17 rue de Montpellier, à Carcassonne.', address = coalesce('17 rue de Montpellier', address) where id = 'c6f9e54e-2c5b-4180-a45d-b1157638c5ef';
update hdar.places set description = 'Sauna au Boulevard de l''Atlantique, à Cherbourg-en-Cotentin.', address = coalesce('Boulevard de l''Atlantique', address) where id = '6d36ae65-caf9-4220-9b99-7126bbba8747';
update hdar.places set description = 'Bar au 49 Rue Fontgiève, à Clermont-Ferrand.', address = coalesce('49 Rue Fontgiève', address) where id = '4adc5542-2489-4c0d-8707-b999246fa4a0';
update hdar.places set description = 'Club au Rue du Coche, à Clermont-Ferrand.', address = coalesce('Rue du Coche', address) where id = 'be31099e-ac30-44e3-9397-c18c11073ae0';
update hdar.places set description = 'Sauna au 18 rue d''Orbey, à Colmar.', address = coalesce('18 rue d''Orbey', address) where id = '998a1c58-d6fd-4199-9e78-ad5cb2deea88';
update hdar.places set description = 'Bar au 53 Rue Devosge, à Dijon.', address = coalesce('53 Rue Devosge', address) where id = '83e78b55-8284-4926-9d0f-b962ef386caa';
update hdar.places set description = 'Sauna au 186 rue Octavie Duchellier, à Dreuil-lès-Amiens Sauna Le Dauphin, lieu de rencontre pour Hétéros, Bi et Gays à Dreuil-les-Amiens.', address = coalesce('186 rue Octavie Duchellier', address) where id = '3100e238-3aeb-4038-a1b9-55f0978779a1';
update hdar.places set description = 'Sauna au 79 chemin du Cores, à Drumettaz-Clarafond.', address = coalesce('79 chemin du Cores', address) where id = '5df15bae-55e6-49e6-a38d-582b439d7b51';
update hdar.places set description = 'Bar au 6 place des Tilleuls 40270, à Grenade sur l.', address = coalesce('6 place des Tilleuls 40270', address) where id = 'aac3a315-54e7-4986-acc2-b72fb51073f8';
update hdar.places set description = 'Club au 124 Cours Berriat, à Grenoble.', address = coalesce('124 Cours Berriat', address) where id = '8340158e-0626-4c00-a27c-352bf77deed5';
update hdar.places set description = 'Bar au 61 Cours Jean Jaurès, à Grenoble.', address = coalesce('61 Cours Jean Jaurès', address) where id = 'a50e72a6-5f30-4720-8ae5-5a44c4398aed';
update hdar.places set description = 'Bar au 2 Rue Louis Bertrand, à Ivry-sur-Seine.', address = coalesce('2 Rue Louis Bertrand', address) where id = 'ebdaa6af-3985-4576-9386-e5fb92681dd4';
update hdar.places set description = 'Bar au Rue d''Estaires, à La Bassée Un bar, plusieurs ambiances… En semaine, le bar Oh est avec une ambiance feutrée, chill, avec la mise à disposition de jeux de sociétés.', address = coalesce('Rue d''Estaires', address) where id = '5c8aff57-fc9f-41fa-9a80-9bac78c790dc';
update hdar.places set description = 'Club au Place du Maréchal Foch, à La Rochelle.', address = coalesce('Place du Maréchal Foch', address) where id = '39ca47ce-a3fa-490c-b75e-8c810867424e';
update hdar.places set description = 'Club échangiste à Le Boulou Au Boulou, proche de Perpignan, le libertinage a trouvé son nouveau paradis.Le plus grand respect des codes et du savoir-vivre de la communauté échangiste.', address = coalesce(address, address) where id = 'b298ffd1-cb04-41f9-af18-ca95a80481f7';
update hdar.places set description = 'Sauna au Chemin de l''Industrie, à Le Cannet.', address = coalesce('Chemin de l''Industrie', address) where id = '4510c164-2cd4-4c5a-aad6-561f5eed98c1';
update hdar.places set description = 'Club au 153 Rue Nationale, à Le Mans.', address = coalesce('153 Rue Nationale', address) where id = '9350ee36-0cbc-4271-86cb-36c706e724c1';
update hdar.places set description = 'Sauna au 263 Boulevard Carnot, à Le Mans.', address = coalesce('263 Boulevard Carnot', address) where id = 'af56f6e2-68ae-4db2-ab98-fb776f8082e8';
update hdar.places set description = 'En couple avec vous-même ou avec votre humain préféré, venez colorer votre sexualité avec conseils, bienveillance & inclusivité au plus créatif sexshop de Lille.', address = coalesce('40 Place de la Gare', address) where id = 'f9cbadc0-6eab-4cdf-9c73-a265c04e0be6';
update hdar.places set description = 'Bar au 17 Boulevard Jean-Baptiste Lebas, à Lille.', address = coalesce('17 Boulevard Jean-Baptiste Lebas', address) where id = 'cfd2aa7b-ee87-4256-aa62-8f0ac369b02d';
update hdar.places set description = 'Sauna au 95 bis rue du Molinel, 59000, à Lille.', address = coalesce('95 bis rue du Molinel, 59000', address) where id = '505f203e-dcbd-43cf-86f6-391f258547ec';
update hdar.places set description = 'Le Cent Douze, notre établissement libertin à Lille, vous accueille 7j/7 dans un cadre raffiné, pour des moments de plaisir coquins et de convivialité.', address = coalesce(address, address) where id = '1c01da41-5199-46f1-b7ec-603dee350b10';
update hdar.places set description = 'Sauna au 52 rue de Cambrai, à Lille.', address = coalesce('52 rue de Cambrai', address) where id = '414e57e7-cb85-44df-b603-6f67dfab3523';
update hdar.places set description = 'Bar au 34 Rue des Bouchers, à Lille.', address = coalesce('34 Rue des Bouchers', address) where id = 'f26c439b-145a-4429-93f7-84545df95e14';
update hdar.places set description = 'Club au 2 Rue Royale, à Lille.', address = coalesce('2 Rue Royale', address) where id = '8e77288b-eb7f-4f56-b270-444d7c79a52c';
update hdar.places set description = 'Bar au 138 Rue Nationale, à Lille.', address = coalesce('138 Rue Nationale', address) where id = 'aeb6d018-ba58-42a1-835a-d816a1aedc94';
update hdar.places set description = 'Club au Rue de Trévise, à Lille.', address = coalesce('Rue de Trévise', address) where id = '62fe3603-e805-4b36-9b9c-bdd88e51df1e';
update hdar.places set description = 'TR3EME LIEU - LIMOGES | Bar near me.', address = coalesce('Rue Raspail', address) where id = '55814352-70ad-4316-bb14-235ee4a218e5';
update hdar.places set description = 'Bar au 20 Rue Lanterne, à Lyon.', address = coalesce('20 Rue Lanterne', address) where id = 'c5a6d7f2-3759-4891-979b-68c4f885e188';
update hdar.places set description = 'Bar au 78 bis Rue Béchevelin, à Lyon Lieu de vie féministe, culturel et militant, à la croisée des luttes queer, noires, racisées et alliées.', address = coalesce('78 bis Rue Béchevelin', address) where id = 'f2adfb39-98f1-40f3-9eb5-05fad8444dba';
update hdar.places set description = 'Bar au 26 Rue de l''Arbre Sec, à Lyon.', address = coalesce('26 Rue de l''Arbre Sec', address) where id = '2199563e-eb73-43d3-980e-157e893af128';
update hdar.places set description = 'Bar au 8 Quai des Célestins, à Lyon.', address = coalesce('8 Quai des Célestins', address) where id = 'da5b9d7c-b008-4555-80e3-84736bcab7b1';
update hdar.places set description = 'Bar au 7 Rue Charles Dullin, à Lyon.', address = coalesce('7 Rue Charles Dullin', address) where id = 'b8640956-4502-4c8d-89ca-2de9d05b52ff';
update hdar.places set description = 'Sauna au 2 rue Coustou, à Lyon Avertissement, L''Oasis Club Sauna est réservé à une clientèle adulte de 18 ans et plus. Accès au contenu pour personne majeure.', address = coalesce('2 rue Coustou', address) where id = '22d6b0bd-2e4a-4651-baad-a2d2808a98de';
update hdar.places set description = 'Club au 3 Rue Terme, à Lyon.', address = coalesce('3 Rue Terme', address) where id = '32d049eb-7471-489c-94b2-c5e8308fc95b';
update hdar.places set description = 'Sauna au 8 rue Constantine, à Lyon.', address = coalesce('8 rue Constantine', address) where id = 'edec1d4b-6e4d-4bc9-9fcc-9d361ee75ab8';
update hdar.places set description = 'Bar au 7 Rue Saint-Bazile, à Marseille.', address = coalesce('7 Rue Saint-Bazile', address) where id = '7d8ba30d-11ac-48e4-8bf1-5c8d11160ef1';
update hdar.places set description = 'Bar au 176 boulevard Chave, 13005, à Marseille Rejoignez notre pub à l’ambiance conviviale avec une touche geek ! Les meilleures bières, bonne humeur et tournois geek pour des soirées inoubliables.', address = coalesce('176 boulevard Chave, 13005', address) where id = '71ae0d0d-4343-4a39-84f4-d74b5fdb56a9';
update hdar.places set description = 'Bar au 24 Cours Honoré d''Estienne d''Orves, à Marseille.', address = coalesce('24 Cours Honoré d''Estienne d''Orves', address) where id = '21a02d66-3242-40bb-a61e-63c981421c12';
update hdar.places set description = 'Bar à Marseille.', address = coalesce(address, address) where id = '7ef25ca6-f773-48f3-aae0-04f15f8fc2e8';
update hdar.places set description = 'Sauna au 8 rue Sébastien Leclerc, à Metz.', address = coalesce('8 rue Sébastien Leclerc', address) where id = '1b361ef8-79a3-4347-ad64-c3c9ef4f9f98';
update hdar.places set description = 'Club au 12 Rue Anatole France, à Montpellier.', address = coalesce('12 Rue Anatole France', address) where id = 'f0b0ebf8-a848-4e5c-a900-db41818eb28c';
update hdar.places set description = 'Bar au 12 Rue du Pila Saint-Gély, à Montpellier.', address = coalesce('12 Rue du Pila Saint-Gély', address) where id = 'da0fb088-6357-4f6e-87c3-0b6c49fb399e';
update hdar.places set description = 'Bar au 4 Rue des Trésoriers de la Bourse, à Montpellier.', address = coalesce('4 Rue des Trésoriers de la Bourse', address) where id = 'd626967d-8f20-48a4-aade-b70363ace370';
update hdar.places set description = 'Sauna gay aux Arceaux : bar, sauna, hammam, jacuzzi et espaces détente, avec une soirée à thème chaque jour de la semaine (cruising, bears, jeunes, naturiste, blackout…). Gratuit pour les moins de 22 ans.', address = coalesce('10 bis avenue de Lodève, 34070', address) where id = 'b728bcc2-2f5c-44c7-b7a6-cb8761bd1299';
update hdar.places set description = 'Club à Montpellier.', address = coalesce(address, address) where id = '3c8b05ac-8eb7-4248-8e86-fd4c10387c43';
update hdar.places set description = 'Bar LGBTQIA+ féministe et queer du quartier Beaux-Arts, ouvert à toutes et tous. DJ sets, soirées drag, lectures et événements.', address = coalesce('Instagram : instagram.com/madrediosa_bar · Facebook : facebook.com/profile.php?id=615547876', address) where id = 'e2531ee6-a291-4fba-aded-40b539c8fdc5';
update hdar.places set description = 'Bar au Place Pablo Picasso, à Montpellier.', address = coalesce('Place Pablo Picasso', address) where id = 'be04c8d2-0dbd-4f42-8b7f-a84cbf91a57b';
update hdar.places set description = 'Club au 4 Quai du Verdanson, à Montpellier.', address = coalesce('4 Quai du Verdanson', address) where id = '42e5879a-9f86-4601-a8b4-1661be447510';
update hdar.places set description = 'Bar au 2 Quai des Tanneurs, à Montpellier.', address = coalesce('2 Quai des Tanneurs', address) where id = 'c05e1aab-2c60-47b7-90cb-0c892edd489e';
update hdar.places set description = 'Sauna à Nantes.', address = coalesce(address, address) where id = '893d36f9-0505-479e-ad33-5653874b448c';
update hdar.places set description = 'Bienvenue dans le monde merveilleux du Petit Marais Nantes, club Gay Friendly... Ici, on porte fièrement nos valeurs avec conviction et humour Bisous kiss.', address = coalesce('15 Rue Kervégan', address) where id = 'dc24cd60-9cf9-42e7-b241-264aff24fab0';
update hdar.places set description = 'Sauna au 5 rue Baron 44000, à Nantes.', address = coalesce('5 rue Baron 44000', address) where id = 'eefdc0b8-2572-4488-8acd-cd6f9198d5c1';
update hdar.places set description = 'Bar au 2 Rue de la Paix, à Nantes.', address = coalesce('2 Rue de la Paix', address) where id = '3b0d47f6-3455-4917-a3a4-e968aeffeb1a';
update hdar.places set description = 'Bar au 19 Rue des Carmes, à Nantes.', address = coalesce('19 Rue des Carmes', address) where id = '1b53d61b-0062-4983-892f-52517ad8e489';
update hdar.places set description = 'Club au 32 Rue Crucy, à Nantes.', address = coalesce('32 Rue Crucy', address) where id = '1b8901e5-5556-44b4-819d-5c359882c335';
update hdar.places set description = 'Bar au 6 Allée Duquesne, à Nantes.', address = coalesce('6 Allée Duquesne', address) where id = 'b0bd4f54-0fdc-422e-a34d-8dfe1a5c02bd';
update hdar.places set description = 'Bar au 19 Rue du Château, à Nantes.', address = coalesce('19 Rue du Château', address) where id = 'b13f7c7b-1d2a-4c38-92e1-f0aa7761dd09';
update hdar.places set description = 'Club à Nice.', address = coalesce(address, address) where id = 'b2a29100-f8c8-4d2c-a9c1-d075378696a0';
update hdar.places set description = 'Club au Rue Eugène Emmanuel, à Nice.', address = coalesce('Rue Eugène Emmanuel', address) where id = '7f971f0c-f04c-443c-96a5-beaf6268151c';
update hdar.places set description = 'Le Couloir BAR GAY LGBT NICE vous reçois à partir de 18 heures, AfterWork, au coeur de la ville à 100 m de la mythique Place Masséna et du vieux Nice.', address = coalesce(address, address) where id = 'adc9464e-e214-40ef-8a4d-d85441f744ba';
update hdar.places set description = 'Sauna à Nice.', address = coalesce(address, address) where id = '7fb3da15-03f8-44be-a0a8-ad8b2d9a1e6e';
update hdar.places set description = 'Bar au 9 Rue Bonaparte, à Nice.', address = coalesce('9 Rue Bonaparte', address) where id = '37100364-dd58-43ce-80b1-c23001675cae';
update hdar.places set description = 'Bar au 3 Rue Lascaris, à Nice.', address = coalesce('3 Rue Lascaris', address) where id = 'd84657f8-ec9c-45d4-972d-c33cb6b79b2f';
update hdar.places set description = 'Retrouvez toutes les infos et les avis sur Red Kafe - 9 Rue Halévy 06000 NICE.', address = coalesce('Rue Halévy', address) where id = 'a5bb6a55-fab0-467a-8c56-e55821eb21f2';
update hdar.places set description = 'Boutique au 14 bis Rue Defly, à Nice.', address = coalesce('14 bis Rue Defly', address) where id = '3d684e2e-467c-4c81-9b78-874811d62a86';
update hdar.places set description = 'Bar au 10 Rue Defly, à Nice.', address = coalesce('10 Rue Defly', address) where id = '9fc9fe4d-78fa-40e4-9af9-afd26b9a2182';
update hdar.places set description = 'Club de cyclisme lesbien, gay, bisexuel, transgenre et queer à Nice. Sorties vélo, pauses café et une communauté LGBTQ+ accueillante pour tous les niveaux.', address = coalesce(address, address) where id = '708d16fb-117f-4f18-bae5-42119a3ff7b8';
update hdar.places set description = 'Bar au Boulevard Victor Hugo, à Nîmes.', address = coalesce('Boulevard Victor Hugo', address) where id = '84edfbb5-ad41-4d54-a91f-2711a51e2c08';
update hdar.places set description = 'Sauna au 1606 Avenue du Maréchal Juin, à Nîmes club F212 – Club de divertissement pour adultes.', address = coalesce('1606 Avenue du Maréchal Juin', address) where id = '5dcb16cb-2253-486f-bdca-8b5faac285ff';
update hdar.places set description = 'Club au Rue Curaterie, à Nîmes.', address = coalesce('Rue Curaterie', address) where id = '888dab51-8943-4647-b594-044a66ec6faf';
update hdar.places set description = 'Sauna au 7-9 rue Fernand Pelloutier, à Nîmes.', address = coalesce('7-9 rue Fernand Pelloutier', address) where id = '5965ac76-24b5-444c-8545-c3153b342896';
update hdar.places set description = 'Sauna au Rue Cordier, à Nîmes SAUNA MIXTE TENDANCE BI / TRANS / HETERO ZEN - Couples libertins, club libertin, initiation SM, SM, Gang Bang, nimes 34 Hérault.', address = coalesce('Rue Cordier', address) where id = 'a715d807-328b-43cf-a6f3-baf057be4ec4';
update hdar.places set description = 'Sauna au Rue de l''Égalité, à Nœux-les-Mines Découvrez Ô CAP, votre sauna gay à Noeux-les-Mines, pour une expérience de détente et de convivialité inédite. Réservez !', address = coalesce('Rue de l''Égalité', address) where id = '0e0297e7-d040-4247-a5e2-a689b8eb6740';
update hdar.places set description = 'Bar au 45 Rue de Montreuil, à Paris.', address = coalesce('45 Rue de Montreuil', address) where id = 'bea8b5ee-dee2-4210-b81b-040fe39ee8c3';
update hdar.places set description = 'Atlantide Sauna, sauna hammam toutes tendances à Paris. Club privé adulte près de la Gare de Lyon, dédié à la détente et aux rencontres.', address = coalesce('13 Rue Parrot', address) where id = '5d75af98-8a0d-4699-9c7e-ea8e0b18c325';
update hdar.places set description = 'Bar à Paris.', address = coalesce(address, address) where id = '38c63063-2815-495a-b354-6e11a3c3e087';
update hdar.places set description = 'Bar à Paris Notre Bar situé au 35 rue Méhul au cœur de la brasserie à Pantin. Un petit havre de paix. Notre Taproom est située au cœur des cuves de la Brasserie.', address = coalesce(address, address) where id = '0ed81091-58cc-4f02-931c-9452f6c3d932';
update hdar.places set description = 'Boutique au 21 Rue des Lombards, à Paris.', address = coalesce('21 Rue des Lombards', address) where id = '282a670f-3d14-4eaf-bcc3-a32a8514076f';
update hdar.places set description = 'La Boîte à frissons : lieu mythique des nuits LGBTQ+ parisiennes au 11 rue au Maire (Paris 3e). Bals, soirées thématiques et danses à deux depuis 1997.', address = coalesce(address, address) where id = '0f0fe4f9-b1e5-4c13-9f8c-5091cca6e8d6';
update hdar.places set description = 'Bar au 40 Rue de Montreuil, à Paris.', address = coalesce('40 Rue de Montreuil', address) where id = 'b6c89177-41d5-453e-81de-170f1e5903fe';
update hdar.places set description = 'Bar au 25 Rue de l''Hirondelle, à Paris.', address = coalesce('25 Rue de l''Hirondelle', address) where id = '12311e54-37bf-449c-b6f7-d46f026ca362';
update hdar.places set description = 'Bar au 5 Port de la Rapée, à Paris.', address = coalesce('5 Port de la Rapée', address) where id = '692e18d9-3c7a-4411-b752-0212241938d8';
update hdar.places set description = 'Site Officiel du Café de la Gare, Théâtre privé parisien. Ici vous pouvez consulter la programmation, réserver un spectacle, lire un petit historique de Sotha, regarder des photos, fondatrice du lieu.', address = coalesce('41 Rue du Temple, 75004', address) where id = '3c92ebc1-e115-4387-93a6-2e8bae2e3acc';
update hdar.places set description = 'Bar au 158 Rue Oberkampf, à Paris.', address = coalesce('158 Rue Oberkampf', address) where id = 'bfc21fc9-6bfc-4b80-91ae-f5e09e0139e4';
update hdar.places set description = 'Bar au 18 Rue du Temple, à Paris.', address = coalesce('18 Rue du Temple', address) where id = '3ef2ba54-edb4-40e5-bc69-fddd51a8f8c0';
update hdar.places set description = 'Bar au 15 rue des Archives 75004, à Paris.', address = coalesce('15 rue des Archives 75004', address) where id = 'af1f82d6-9139-4066-bd2b-e666159967ae';
update hdar.places set description = 'Club au 21 Rue Dauphine, à Paris.', address = coalesce('21 Rue Dauphine', address) where id = '84a2ed17-b0db-42ca-b5b6-eb533cbc08df';
update hdar.places set description = 'Club au 12 Rue des Haudriettes, à Paris.', address = coalesce('12 Rue des Haudriettes', address) where id = '13441efd-2a58-45eb-9364-458598ec0299';
update hdar.places set description = 'Club à Paris.', address = coalesce(address, address) where id = 'ac138219-a860-4488-80eb-b6042413cdc8';
update hdar.places set description = 'Bar au 45 rue de la Folie Méricourt, à Paris.', address = coalesce('45 rue de la Folie Méricourt', address) where id = '77bda544-6583-4e6d-9436-cff870e4f6f5';
update hdar.places set description = 'Club à Paris.', address = coalesce(address, address) where id = '289a8fe5-8599-469e-ad8d-36ce709aafb9';
update hdar.places set description = 'Club à Paris.', address = coalesce(address, address) where id = '0af03c85-36c3-4089-8511-212ccc8db102';
update hdar.places set description = 'Club au 104 Rue de Bagnolet, à Paris.', address = coalesce('104 Rue de Bagnolet', address) where id = '112709d0-e0d8-4508-a1a7-2bd9a214b672';
update hdar.places set description = 'Club au 18 Rue du Faubourg du Temple, à Paris.', address = coalesce('18 Rue du Faubourg du Temple', address) where id = 'e86ad2f3-67a0-46dd-a7e4-c2a3c99f51a1';
update hdar.places set description = 'Sauna au 4 rue du Faubourg Montmartre 75009, à Paris.', address = coalesce('4 rue du Faubourg Montmartre 75009', address) where id = 'b1fbdc38-c1b7-4b8e-865e-fd73d338ef5d';
update hdar.places set description = 'Boutique au 18 Rue Sainte-Croix de la Bretonnerie, à Paris.', address = coalesce('18 Rue Sainte-Croix de la Bretonnerie', address) where id = '3fb7b1a2-58a7-4d90-b62c-d778976ce852';
update hdar.places set description = 'Bar cruising à Paris.', address = coalesce(address, address) where id = 'c63ad56c-8e17-4e2f-86ca-b43b88d02e68';
update hdar.places set description = 'Open air, Paris 19, ouvert du 5 mai au 31 octobre 2023. Club, soirées techno & house.', address = coalesce('Rue Ella Fitzgerald', address) where id = '5b305956-e9d3-4b15-a797-2cc4de950d83';
update hdar.places set description = 'Bar gay au cœur de Paris. Grand bar, cocktails et soirées à thème.', address = coalesce(address, address) where id = '32f007b7-ef69-49fb-8a8e-ee660c753878';
update hdar.places set description = 'Club au 105 Rue du Faubourg du Temple, à Paris.', address = coalesce('105 Rue du Faubourg du Temple', address) where id = 'b83eccd1-4184-4ea1-9d87-3b8f46397565';
update hdar.places set description = 'Club au 90 Boulevard de Clichy, à Paris La Machine du Moulin Rouge et son Bar à Bulles : club · concert · event · culture · boire et manger.', address = coalesce('90 Boulevard de Clichy', address) where id = 'b83e65fc-fed5-4620-bea0-1b1d7d882ad3';
update hdar.places set description = 'Bar au 176-178 Rue Saint-Martin, à Paris.', address = coalesce('176-178 Rue Saint-Martin', address) where id = '1f29b1e5-6a71-49a9-9781-cc59b8cae23b';
update hdar.places set description = 'Bar au 226 rue de Vaugirard 75015, à Paris.', address = coalesce('226 rue de Vaugirard 75015', address) where id = 'e02a2371-b71a-4653-af7d-8a45093d7737';
update hdar.places set description = 'Bar cruising à Paris.', address = coalesce(address, address) where id = 'a6dcca0f-8b25-4031-98e1-3d8dabf79175';
update hdar.places set description = 'Bar au 35 rue Sainte-Croix de la Bretonnerie 75004, à Paris.', address = coalesce('35 rue Sainte-Croix de la Bretonnerie 75004', address) where id = '2e8e19fa-6d4a-4489-8701-e51673491398';
update hdar.places set description = 'Bar au 18 rue Feydau 75002, à Paris.', address = coalesce('18 rue Feydau 75002', address) where id = '0503c8b2-f9c7-4dc1-b073-3fc879ae6ac1';
update hdar.places set description = 'Bar au 34 rue Charlot 75003, à Paris.', address = coalesce('34 rue Charlot 75003', address) where id = '7cca2864-8622-474d-bb26-0d8d4ed7b54e';
update hdar.places set description = 'Bar au 11 rue Pierre Fontaine 75009, à Paris.', address = coalesce('11 rue Pierre Fontaine 75009', address) where id = '293e6680-3733-4363-9d82-283a48a9dcb7';
update hdar.places set description = 'Bar au 73 rue d’Alésia – angle 2, rue Marguerin 75014, à Paris.', address = coalesce('73 rue d’Alésia – angle 2, rue Marguerin 75014', address) where id = '3b01d4b7-d0b2-4a4b-a883-6952d1b55356';
update hdar.places set description = 'Découvrez l''accueil exclusif de Les Bains Paris, reflétant le luxe et l''élégance au cœur de la ville lumière, pour des moments inoubliables.', address = coalesce('7 Rue du Bourg l''Abbé', address) where id = '70bf4320-3ba1-4f46-b348-fda076031b6e';
update hdar.places set description = 'Club à Paris.', address = coalesce(address, address) where id = 'de6f3923-1e6a-4f8b-85bd-c4c3a5bdf46b';
update hdar.places set description = 'Club à Paris.', address = coalesce(address, address) where id = 'c8f2cf7e-e7ea-4804-847e-17d0765b0644';
update hdar.places set description = 'Bienvenue dans le temple de la vie parisienne. Marque emblématique qui incarne le luxe et l''élégance à la française, Maxim’s est née du célèbre restaurant parisien fondé en 1893 rue Royale.', address = coalesce('3 Rue Royale', address) where id = 'd9ec0bcd-c974-4f0b-9a23-4aab1f7956b0';
update hdar.places set description = 'Bar au 8 Rue Richard Lenoir, à Paris.', address = coalesce('8 Rue Richard Lenoir', address) where id = 'd37415f1-688d-4efa-bfc4-38c35b829194';
update hdar.places set description = 'Bar au 83 rue Jean-Pierre Timbaud 75011, à Paris.', address = coalesce('83 rue Jean-Pierre Timbaud 75011', address) where id = 'b6a4060f-fba1-402d-8435-0356d384227a';
update hdar.places set description = 'Club au 62 Rue Mazarine, à Paris.', address = coalesce('62 Rue Mazarine', address) where id = 'c1c2cf50-a094-4ad4-b527-7bb4d6be484b';
update hdar.places set description = 'Paname Boxing Club – L’association parisienne de boxe française ouverte à toutes et à tous – gays, lesbiennes, bi, trans*, hétéros – qui souhaitent pratiquer ce sport sans risque de discriminati.', address = coalesce(address, address) where id = '0391af6c-c1ef-4bd1-8930-c598e8705428';
update hdar.places set description = 'Electro cocktail bar situé rue Amelot à Paris, le Panic Room pour l''apéro, un date, un anniversaire ou pour danser.', address = coalesce('101 Rue Amelot', address) where id = '06bcd244-7ebc-41da-98de-c845ba727ff1';
update hdar.places set description = 'Club à Paris.', address = coalesce(address, address) where id = 'd77c9bf5-164f-432b-9290-7b9f2dc47f05';
update hdar.places set description = 'Bar au 10 Rue de la Verrerie, à Paris.', address = coalesce('10 Rue de la Verrerie', address) where id = '0e4aa451-2957-4ced-a1c2-358c7bf3fb72';
update hdar.places set description = 'Bar au 9 rue du Pélican 75001, à Paris.', address = coalesce('9 rue du Pélican 75001', address) where id = 'f487c34c-66e7-4b7d-b31f-cbf406a7a185';
update hdar.places set description = 'Club au 5 Boulevard Poissonnière, à Paris 38 ans de musique électronique.', address = coalesce('5 Boulevard Poissonnière', address) where id = '7039482a-113c-4409-a79c-aabf434ac683';
update hdar.places set description = 'Bar au Porte Jaune, à Paris Rosa Bonheur à l''Est Niché sur le lac des Minimes, au coeur du Bois de Vincennes. Dernier né des guinguettes.', address = coalesce('Porte Jaune', address) where id = '6fe9a56d-284b-4a35-beaf-e289eb2c766b';
update hdar.places set description = 'Bar au 2 Avenue de la Cascade, à Paris Le Rosa Bonheur : des guinguettes où l''esprit de la Camargue règne en fête. Des lieux où il fait bon vivre, et où se mêlent gens, genres et vent de liberté.', address = coalesce('2 Avenue de la Cascade', address) where id = '5986bc9b-584f-4522-b7ee-61fcf28675f6';
update hdar.places set description = 'Le Sacré est un lieu de vie nocturne situé au cœur de Paris (2ème). Club électro, bar tapas et comedie club. Découvrez notre programmation et réservez vos billets.', address = coalesce('142 Rue Montmartre', address) where id = '92b0ffe4-ef4c-44c7-a7bb-f45a730338a3';
update hdar.places set description = 'Sauna au 5 rue Odessa, à Paris.', address = coalesce('5 rue Odessa', address) where id = '45484c5a-43f7-4d2a-a843-1bb73952def3';
update hdar.places set description = 'Sauna gay à Paris - Euro Men''S Club.', address = coalesce('10 rue Saint-Marc', address) where id = '8c7c3bd2-6785-4c16-8a96-d96032cf6429';
update hdar.places set description = 'Sauna à Paris Le Sauna Mykonos est un endroit convivial et relaxant où les hommes peuvent se détendre et se connecter dans une atmosphère chaleureuse et confortable.', address = coalesce(address, address) where id = '42f8f486-7bcf-45b8-bcf1-b0f0a3ea7a6c';
update hdar.places set description = 'Sauna au 66 rue de Provence 75009, à Paris.', address = coalesce('66 rue de Provence 75009', address) where id = '060ced69-16d7-41c2-ae80-03a381bef44a';
update hdar.places set description = 'Bar au 4 Rue Viollet-le-Duc, à Paris.', address = coalesce('4 Rue Viollet-le-Duc', address) where id = 'e7aaaec3-f655-4a77-bc2d-afd49961abd7';
update hdar.places set description = 'Bar au 45 Rue de Montreuil, à Paris Bar à cocktails Ethique, culturel et végétal LGBTQIA+ Mardi-Samedi 18h-2h.', address = coalesce('45 Rue de Montreuil', address) where id = '2390cf5d-ddfd-419f-9f66-74e4fce309d3';
update hdar.places set description = 'Club au 22 Rue du Départ, à Paris Inspirer l’inédit, façonner l’inoubliable.', address = coalesce('22 Rue du Départ', address) where id = 'fe412221-df83-41b9-b5c6-28680af64673';
update hdar.places set description = 'Bar au 16 Boulevard Jules Ferry, à Paris.', address = coalesce('16 Boulevard Jules Ferry', address) where id = '30b639cb-4354-443a-a7ac-83d152305766';
update hdar.places set description = 'Club au 13 Avenue du Président Wilson, à Paris.', address = coalesce('13 Avenue du Président Wilson', address) where id = '5837b13e-feba-4ee6-89fa-a3cd810284aa';
update hdar.places set description = 'Boutique à Pau.', address = coalesce(address, address) where id = '02015c0f-9c5e-403e-838c-0539470988b2';
update hdar.places set description = 'Bar au 6 Rue René Fournets, à Pau.', address = coalesce('6 Rue René Fournets', address) where id = '59b9fa59-cf28-4ccc-be3c-35dcfdcb5df6';
update hdar.places set description = 'Sauna Gay Le Cantou à Périgueux. Espace Libertin. Profitez de 200m2 d''installation. Tarifs événementiels réguliers. Venez nombreux.', address = coalesce('14 rue Lafayette', address) where id = '927009ee-6690-4500-8add-d565fbec35c6';
update hdar.places set description = 'JET SET - PERPIGNAN | Mediterranean cuisine near me | Book now.', address = coalesce('4 Rue Général de La Bédoyère', address) where id = 'abf819a4-f7fe-49c3-874a-cb092ab28285';
update hdar.places set description = 'Bar à Quimper.', address = coalesce(address, address) where id = 'bd97fa15-85b4-4f6a-acbe-aef728f65e7e';
update hdar.places set description = 'Boutique à Quimper.', address = coalesce(address, address) where id = '7891cf02-2c70-42b4-84ae-25db08ab8b11';
update hdar.places set description = 'Club au Rue Théodore Monod, à Ramonville-Saint-Agne.', address = coalesce('Rue Théodore Monod', address) where id = 'a7206f7c-6c48-48a3-86c0-23c9ffa4eea8';
update hdar.places set description = 'Sauna au 33 rue de Witry, à Reims.', address = coalesce('33 rue de Witry', address) where id = '1bbf9ea9-e31b-4830-bea0-a87dc1d99197';
update hdar.places set description = 'Club au 34 Rue Vasselot, à Rennes.', address = coalesce('34 Rue Vasselot', address) where id = 'b13565e6-c692-44b7-9095-bfa25d512cac';
update hdar.places set description = 'Sauna au 7-9 rue de Léon, à Rennes.', address = coalesce('7-9 rue de Léon', address) where id = '7c60533a-bc7f-4578-b1e9-1dcbdc8496c7';
update hdar.places set description = 'Sauna gay à Rennes, ouvert tous les jours. Spa, hammam, jacuzzi, bar licence IV et terrasse naturiste plein sud. Entrée à partir de 5 €.', address = coalesce('15 Rue de la Donelière', address) where id = 'b192b02d-195d-4ca7-8310-78d68a63d54f';
update hdar.places set description = 'Bar au 11 bis Rue de Fontenelle, à Rouen.', address = coalesce('11 bis Rue de Fontenelle', address) where id = '6ad1d812-7b19-4fdb-b297-f03284f3e124';
update hdar.places set description = 'C''est dans une ambiance Parisienne au coeur de Rouen, que nous vous recevons dans un cadre Intimiste, convivial et chaleureux. Laissez-vous emporter par ...', address = coalesce('2 Rue Malherbe', address) where id = '757a3633-cd66-41c6-ab9d-0e79803f0644';
update hdar.places set description = 'Sauna 100% Gay situé dans le centre ville de Rouen 100% masculin lieu de cruising Sauna Hammam. Entrée discrète.', address = coalesce('39 rue Saint Nicolas', address) where id = '2090bc22-28b9-4019-be3a-3d07ac10ae8a';
update hdar.places set description = 'Milk, votre bar de nuit LGBT+ à Rouen : terrasse, cocktails, soirées à thèmes, After Work de 18h à 20h. 1 bis rue du Père Adam, 76000 Rouen.', address = coalesce('1 bis Rue du Père Adam', address) where id = 'e8b516e4-a709-47fe-bad4-fd48c40708b5';
update hdar.places set description = 'Club au 7 Place du Chai, à Saint-Brieuc.', address = coalesce('7 Place du Chai', address) where id = '68e11c7a-1e19-4d05-a885-517efae3d046';
update hdar.places set description = 'Sauna au Rue Jean-Claude Verpilleux Saint-Étienne, à Saint-Etienne Le Mikonos, club associatif échangiste gay situé à Saint Etienne (Loire 42) est un salon privé exclusivement masculin équipé d''un sauna et d''un hammam.', address = coalesce('Rue Jean-Claude Verpilleux Saint-Étienne', address) where id = '8948799b-539e-4925-b9fe-444fec0addb1';
update hdar.places set description = 'Sauna au 2025/07/LogoLeDestressium.png" alt="" class="wp-image-32760, à size-full.', address = coalesce('2025/07/LogoLeDestressium.png" alt="" class="wp-image-32760', address) where id = '2e01624c-654f-4663-88cb-7fa01310fd71';
update hdar.places set description = 'Bar au 20 Rue des Couples, à Strasbourg.', address = coalesce('20 Rue des Couples', address) where id = '1346f5fb-08b9-4242-94e9-4233451ca5ec';
update hdar.places set description = 'Sauna au 2a rue Moll, à Strasbourg.', address = coalesce('2a rue Moll', address) where id = 'dd7c7972-019c-41a7-b080-6b760beeb0c9';
update hdar.places set description = 'Club à Strasbourg.', address = coalesce(address, address) where id = '512a133b-43b5-4713-a637-0c34fd03a0e1';
update hdar.places set description = 'Espace culturel hybride - Karmen Camina est un lieu de rencontres, de liberté, de création et d’expression avec un engagement pour le progrès écologique et social, la création sonore et visuelle, et toute forme d''expérimentation et d’innovation créative permettant de faire commun.', address = coalesce('4 Cour des Cigarières', address) where id = '1f648f0e-7401-4931-ad52-a50006ff256a';
update hdar.places set description = 'Bar au Rue Georges Wodli, à Strasbourg Terrasse culturelle à but non lucratif, La Grenze est un espace sans frontières ouvert à tou.te.s.', address = coalesce('Rue Georges Wodli', address) where id = '720557a6-fe45-4c2a-babf-33c2220d8d6a';
update hdar.places set description = 'Sauna au 3 Place Clément, à Strasbourg.', address = coalesce('3 Place Clément', address) where id = '6d47754a-056e-43bc-9ed4-548a3e1dbaa5';
update hdar.places set description = 'Club au 26 Allée des Foulques, à Toulouse ARENA | La résonance de l''âme.', address = coalesce('26 Allée des Foulques', address) where id = '0f1f768e-7e51-4933-8bfb-70faecd4fc14';
update hdar.places set description = 'Bar au 44 boulevard de la Gare, 31500, à Toulouse.', address = coalesce('44 boulevard de la Gare, 31500', address) where id = '7f43f787-4392-4be4-976c-6d22b64f8b33';
update hdar.places set description = 'Accueil - Flashback Café Toulouse.', address = coalesce(address, address) where id = 'bb6f4407-6aa3-46e3-bd65-cfb6ba45f33b';
update hdar.places set description = 'Bar au 197 Route de Saint-Simon, à Toulouse Programmation culturelle et festive novembre 2026 - Site de Folles Saisons !', address = coalesce('197 Route de Saint-Simon', address) where id = '729653a1-31a5-40a6-bb0a-da46f451e7d0';
update hdar.places set description = 'Club non-conformiste pr�s de Toulouse - Agitateur de libertins depuis 1995.', address = coalesce(address, address) where id = '5b234169-a786-47c5-9e56-6987b9fa1d03';
update hdar.places set description = 'Club au 30 Rue de Stalingrad, à Toulouse.', address = coalesce('30 Rue de Stalingrad', address) where id = 'dee0a9ec-0b08-4026-8d06-df2684f7c974';
update hdar.places set description = 'Bar au 18 Avenue Étienne Billières, à Toulouse.', address = coalesce('18 Avenue Étienne Billières', address) where id = '060b45fa-5488-470c-bdd8-bd58f0bc6127';
update hdar.places set description = 'Bar au 16 Place Charles Laganne, à Toulouse.', address = coalesce('16 Place Charles Laganne', address) where id = 'f342960d-a94a-49a8-a454-240b93097f67';
update hdar.places set description = 'Sauna au 5 impasse Saint-Aubin 31000, à Toulouse.', address = coalesce('5 impasse Saint-Aubin 31000', address) where id = 'd48dd4ab-7306-4aec-8525-13a15cb46999';
update hdar.places set description = 'Club au 23 Rue Pierre Paul Riquet, à Toulouse.', address = coalesce('23 Rue Pierre Paul Riquet', address) where id = '3c54e419-17de-43bc-b189-38791be6a2a9';
update hdar.places set description = 'Bar au 1 Rue Marthe Varsi, à Toulouse.', address = coalesce('1 Rue Marthe Varsi', address) where id = '2b2af864-0c2d-4bfa-aba0-ce01407decf9';
update hdar.places set description = 'Boutique à Tours.', address = coalesce(address, address) where id = '837aede8-a392-49df-8f39-6de02b28291b';
update hdar.places set description = 'Sauna au Cour Brasserie, à Uckange.', address = coalesce('Cour Brasserie', address) where id = 'c23ca87f-4543-4514-bfc3-632bc57621bf';
update hdar.places set description = 'Bar à Valence.', address = coalesce(address, address) where id = '95a7ecd9-d0cf-4e61-a2b3-a2fb29f6d8c9';
update hdar.places set description = 'Sauna.', address = coalesce(address, address) where id = '986c5748-ca8e-4391-abf7-644f087886f3';
update hdar.places set description = 'Bar.', address = coalesce(address, address) where id = 'abaa7ff8-3bbf-42cb-9149-36c91c3246f8';
update hdar.places set description = 'Sauna.', address = coalesce(address, address) where id = '51187728-92c6-4aa6-8dac-6449757cf443';
update hdar.places set description = 'Bar.', address = coalesce(address, address) where id = '0495ee35-1bfe-492a-9a72-d76963a673b2';
update hdar.places set description = 'Club échangiste Découvrez Le New Bora à Castillon-du-Gard : club libertin, sauna, hammam, jacuzzi et piscine extérieure. Consultez les horaires, tarifs et soirées.', address = coalesce(address, address) where id = '11ec9807-b62e-49af-8d61-82f4f32bad6a';
update hdar.places set description = 'Bar.', address = coalesce(address, address) where id = '1df44378-7726-405b-8fd7-e3ccdb56df06';
update hdar.places set description = 'Bar.', address = coalesce(address, address) where id = 'f3504936-5380-4473-bee3-163626fd8393';
update hdar.places set description = 'Bar.', address = coalesce(address, address) where id = 'f1a3714a-d692-4b03-92cd-e3c2196407de';
update hdar.places set description = 'Club.', address = coalesce(address, address) where id = 'a37a5a16-5cc5-4b35-88de-0e225749253c';
update hdar.places set description = 'Bar.', address = coalesce(address, address) where id = '09a5e77d-3f3b-4ebc-abb4-79d824825dea';
update hdar.places set description = 'Bar.', address = coalesce(address, address) where id = '001a49c4-a29d-4337-83ce-a6e93ca91b01';
update hdar.places set description = 'Bar Le Queer Lieu – Café partagé queer à Saint-Denis.', address = coalesce(address, address) where id = '185dee24-4927-436e-9ef2-21e402dbe897';
update hdar.places set description = 'Bar.', address = coalesce(address, address) where id = 'b44033bd-500a-49e9-9ef6-e9227b5e6030';
update hdar.places set description = 'Sauna.', address = coalesce(address, address) where id = '9357ef4a-bd5e-4af4-82c6-56d84dd93b50';
update hdar.places set description = 'Club.', address = coalesce(address, address) where id = '235b35b5-b64a-4e1d-a300-039a0330702e';
update hdar.places set description = 'Ground s.�r.l. - Luxembourg.', address = coalesce('Rue de Hollerich', address) where id = '7ad85bad-a109-4eb6-929a-3f1dabc44c82';
update hdar.places set description = 'Discover Lapart on LinkMe: LUNCH | BORREL | UITGAAN Hof 6 | Amersfoort Openingstijden Ma: Gesloten Di: Gesloten Wo: 11:00 - 22:00 Do: 11:00 - 00:00 Vr: 15:00 - 04:00 Za: 11:00 - 04:00 Zo: 12:00 - 22:00.', address = coalesce(address, address) where id = 'f7f88d61-aac2-4f7f-8c4e-9c3123a36469';
update hdar.places set description = 'Bar in Amsterdam.', address = coalesce(address, address) where id = '8c92b519-42f4-4583-bb7b-aaadef42fd4d';
update hdar.places set description = 'Bar in Amsterdam.', address = coalesce(address, address) where id = '0ff06d65-3090-49aa-8a69-d81083106525';
update hdar.places set description = 'Bar in Amsterdam.', address = coalesce(address, address) where id = 'b172dc62-04de-4acc-88ad-6eda9fb83a59';
update hdar.places set description = 'Bar in Amsterdam.', address = coalesce(address, address) where id = 'a25dc9d8-1746-4440-a3be-4e3d57e3ffb2';
update hdar.places set description = 'Bar in Amsterdam.', address = coalesce(address, address) where id = '1952eae5-f4a0-443e-b01a-1faa047c7e72';
update hdar.places set description = 'Winkel in Amsterdam.', address = coalesce(address, address) where id = '49226015-f74c-4d8d-9e33-44e3bc757b53';
update hdar.places set description = 'Sauna in Amsterdam.', address = coalesce(address, address) where id = 'e8fb62c3-af60-4814-8d5a-438218fce75f';
update hdar.places set description = 'Club in Amsterdam.', address = coalesce(address, address) where id = '0e8889cd-19b4-44dd-9b8e-806b8e9be8bb';
update hdar.places set description = 'Club in Amsterdam.', address = coalesce(address, address) where id = '7c59cc87-6d1b-40f8-bd4f-5f43f8403b3d';
update hdar.places set description = 'Bar in Amsterdam.', address = coalesce(address, address) where id = 'e5e63df2-00ef-4fd2-832b-4dfab19f279b';
update hdar.places set description = 'Queer café en historische bruinbar in Amsterdam. Een inclusieve (ontmoetings-) plek voor vrouwen en de LHBTQIAP+ gemeenschap.', address = coalesce(address, address) where id = '9c1664e4-7abd-44e5-b5d6-a9c2628222d9';
update hdar.places set description = 'Bar in Amsterdam Serving the gay community since 1978.', address = coalesce(address, address) where id = '1915d6f9-25cb-433e-a132-1d690614f70e';
update hdar.places set description = 'Bar in Amsterdam.', address = coalesce(address, address) where id = 'c267061c-feab-4860-905e-0b5a56c6cf22';
update hdar.places set description = 'Bezoek Café The Queen''s Head, een iconische gay bar in Amsterdam met Drag Queen Bingo en diverse evenementen!', address = coalesce(address, address) where id = 'ed39bea8-0001-4157-b464-23180991283a';
update hdar.places set description = 'Sauna in Beek Gaysauna Maastricht is voor mannen die willen relaxen en genieten van een (ont)spannend dagje uit: of men nu gay, biseksueel of “open-minded” is.', address = coalesce(address, address) where id = '28c13c8d-1b59-4fe9-9d97-9ee9f4ca477b';
update hdar.places set description = 'Sauna Tibet – Men Only Sauna in Eindhoven.', address = coalesce(address, address) where id = 'c8cf1c4c-001a-4595-b0c9-748bec02abe1';
update hdar.places set description = 'Sauna in Kerkrade.', address = coalesce(address, address) where id = '43c1b381-ab5e-4b2a-b3e5-297c64c96677';
update hdar.places set description = 'Bar in Maastricht.', address = coalesce(address, address) where id = 'cb7863fe-59dd-43e0-9d76-13b35bdbea88';
update hdar.places set description = 'Bar in Rotterdam.', address = coalesce(address, address) where id = 'ffb208b4-9b2b-4cf7-badb-ff1ce4686030';
update hdar.places set description = 'Bar in Rotterdam.', address = coalesce(address, address) where id = 'e1d9ff02-e1d6-49c9-83fc-d479b8cbf114';
update hdar.places set description = 'Bar in Utrecht Bodytalk is een van de oudste gay bars van Nederland. Op sommige avonden megadruk, dus houd dan rekening met een wachttijd om binnen te komen.', address = coalesce(address, address) where id = '7ae618c6-7ada-44d5-b0c7-74ea162afc4d';
update hdar.places set description = 'Bar in Utrecht.', address = coalesce(address, address) where id = '1da14a72-1a83-474c-b327-700d8c63e1ad';

-- Carte : renvoyer le type pour la couleur du pin.
create or replace function hdar.places_map_build(p_s double precision, p_w double precision, p_n double precision, p_e double precision) returns jsonb
language sql stable set search_path to '' as $$
  select coalesce((select jsonb_agg(jsonb_build_object(
      'id', x.id, 'kind', x.kind, 'name', x.name, 'lat', x.lat, 'lng', x.lng,
      'partner', x.listing = 'partner', 'pro_boost', x.pro_boost,
      'listing', x.listing, 'verified', x.verified, 'venue', x.venue
    ) order by x.pro_boost desc, (x.listing = 'partner') desc)
    from (
      select p.id, p.kind, p.name, p.lat, p.lng,
        case when p.map_listing = 'partner'
              and p.status = 'approved'
              and (not p.partner or coalesce(p.partner_until > now(), false))
             then 'partner'
             when p.map_listing = 'discover' then 'discover'
             else 'hidden' end as listing,
        coalesce(p.verified, false) as verified,
        coalesce(p.map_listing = 'partner' and p.partner and p.partner_until > now() and p.pro_boost_until > now(), false) as pro_boost,
        coalesce(p.venue_kind, case p.kind when 'sauna' then 'sauna' when 'club' then 'club' when 'bar' then 'bar' else null end) as venue
      from hdar.places p
      where p.kind not in ('toilets','station','metro','bus','airport')
        and not (p.source = 'osm' and p.kind in ('park','garden','viewpoint','square','promenade'))
        and p.lat between p_s and p_n
        and (case when p_w <= p_e then p.lng between p_w and p_e else p.lng >= p_w or p.lng <= p_e end)
        and (
          p.map_listing = 'discover'
          or (p.status = 'approved' and (not p.partner or coalesce(p.partner_until > now(), false)))
        )
      order by 7 desc, (p.map_listing = 'partner') desc
      limit 5000) x
    where x.listing <> 'hidden'), '[]'::jsonb)
$$;
revoke all on function hdar.places_map_build(double precision, double precision, double precision, double precision) from public, anon, authenticated;

drop function if exists public.hdar_place_get(uuid);
create or replace function public.hdar_place_get(p_id uuid)
returns table (
  id uuid, kind text, name text, description text, lat double precision, lng double precision,
  source text, source_ref text, partner boolean, city text, address text, hours text,
  tags text[], website text, listing text, verified boolean, cover_credit text, photos text[], venue text
) language plpgsql volatile security definer set search_path to '' as $$
declare s text := hdar.self_id(); p hdar.places;
begin
  select * into p from hdar.places where hdar.places.id = p_id;
  if p.id is null or not hdar.place_visible(p) then return; end if;
  insert into hdar.place_daily (day, place_id, views) values (current_date, p_id, 1)
    on conflict (day, place_id) do update set views = hdar.place_daily.views + 1;
  insert into hdar.place_visitors values (current_date, p_id, s) on conflict do nothing;
  id := p.id; kind := p.kind; name := p.name;
  description := hdar.public_place_description(p);
  lat := p.lat; lng := p.lng; source := p.source; source_ref := p.source_ref;
  partner := (p.map_listing = 'partner');
  city := p.city; address := p.address; hours := p.hours;
  tags := case when hdar.risk_country(p.country) then '{}'::text[] else coalesce(p.tags, '{}') end;
  website := p.website;
  listing := case when p.map_listing = 'partner' then 'partner' else 'discover' end;
  verified := coalesce(p.verified, false);
  cover_credit := p.cover_credit;
  photos := case when p.map_listing = 'partner' or p.verified then coalesce(p.photos, '{}') else '{}'::text[] end;
  venue := coalesce(p.venue_kind, case p.kind when 'sauna' then 'sauna' when 'club' then 'club' when 'bar' then 'bar' else null end);
  return next;
end $$;
revoke all on function public.hdar_place_get(uuid) from public, anon;
grant execute on function public.hdar_place_get(uuid) to authenticated, anon;


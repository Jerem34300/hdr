-- v150 : type association (sport) et corrections de fiches mal typées
-- Front Runners et autres associations sportives classées à tort comme des clubs/discothèques.

alter table hdar.places drop constraint if exists places_kind_check;
alter table hdar.places add constraint places_kind_check
  check (kind = any (array[
    'cruising','beach','park','garden','viewpoint','square','promenade','aire',
    'other','toilets','bar','club','sauna','station','metro','bus','airport',
    'association'
  ]::text[]));

alter table hdar.places drop constraint if exists places_venue_kind_check;
alter table hdar.places add constraint places_venue_kind_check
  check (venue_kind is null or venue_kind = any (array[
    'bar','club','sauna','shop','exchange','cruising','association'
  ]::text[]));

drop function if exists public.hdar_place_get(uuid);
create or replace function public.hdar_place_get(p_id uuid)
returns table(
  id uuid, kind text, name text, description text, lat double precision, lng double precision,
  source text, source_ref text, partner boolean, city text, address text, hours text,
  tags text[], website text, listing text, verified boolean, cover_credit text, photos text[], venue text,
  description_i18n jsonb
)
language plpgsql
security definer
set search_path to ''
as $function$
declare s text := hdar.self_id(); p hdar.places; own boolean;
begin
  select * into p from hdar.places where hdar.places.id = p_id;
  if p.id is null or not hdar.place_visible(p) then return; end if;
  insert into hdar.place_daily (day, place_id, views) values (current_date, p_id, 1)
    on conflict (day, place_id) do update set views = hdar.place_daily.views + 1;
  insert into hdar.place_visitors values (current_date, p_id, s) on conflict do nothing;
  own := (p.owner_id is not null and p.owner_id = s);
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
  photos := hdar.place_public_photos(p.photos, own or p.map_listing = 'partner' or coalesce(p.verified, false));
  venue := coalesce(p.venue_kind, case p.kind when 'sauna' then 'sauna' when 'club' then 'club' when 'bar' then 'bar' when 'association' then 'association' else null end);
  description_i18n := hdar.public_place_description_i18n(p);
  return next;
end
$function$;


grant execute on function public.hdar_place_get(uuid) to anon, authenticated, service_role;

update hdar.places set
  kind = 'association',
  venue_kind = 'association',
  description = left($d0af03c85$Association de course à pied LGBTQIA+ à Paris, fondée en 1992 (loi 1901). Plus de 750 adhérents, ouverte à toustes et aux allié·es. Entraînements le mardi et le jeudi à 19h25, et le week-end à 10h10.$d0af03c85$, 1000),
  description_i18n = $i0af03c85${"fr": "Association de course à pied LGBTQIA+ à Paris, fondée en 1992 (loi 1901). Plus de 750 adhérents, ouverte à toustes et aux allié·es. Entraînements le mardi et le jeudi à 19h25, et le week-end à 10h10.", "en": "LGBTQIA+ running club in Paris, founded in 1992 (French law 1901 association). More than 750 members, open to everyone and to allies. Training on Tuesday and Thursday at 7:25 pm, and at the weekend at 10:10 am.", "es": "Asociación de running LGBTQIA+ en París, fundada en 1992 (ley 1901). Más de 750 socios, abierta a todas las personas y a aliados. Entrenamientos martes y jueves a las 19:25, y el fin de semana a las 10:10.", "de": "LGBTQIA+-Laufverein in Paris, gegründet 1992 (Verein nach dem Gesetz von 1901). Mehr als 750 Mitglieder, offen für alle und für Verbündete. Training dienstags und donnerstags um 19:25 Uhr sowie am Wochenende um 10:10 Uhr.", "it": "Associazione di corsa LGBTQIA+ a Parigi, fondata nel 1992 (legge 1901). Oltre 750 iscritti, aperta a tuttə e alle persone alleate. Allenamenti il martedì e il giovedì alle 19:25, e nel weekend alle 10:10.", "pt": "Associação de corrida LGBTQIA+ em Paris, fundada em 1992 (lei de 1901). Mais de 750 aderentes, aberta a todas as pessoas e a aliados. Treinos à terça e à quinta às 19h25, e no fim de semana às 10h10.", "ar": "جمعية للجري LGBTQIA+ في باريس، تأسست عام 1992 (قانون 1901). أكثر من 750 منتسباً، مفتوحة للجميع وللحلفاء. التدريبات يومي الثلاثاء والخميس الساعة 19:25، وفي عطلة نهاية الأسبوع الساعة 10:10."}$i0af03c85$::jsonb,
  hours = $hrs$mardi, jeudi 19h25 ; samedi, dimanche 10h10$hrs$,
  website = $web$https://frontrunnersparis.org$web$
where id = '0af03c85-36c3-4089-8511-212ccc8db102';


update hdar.places set
  kind = 'association',
  venue_kind = 'association',
  description = left($db2a29100$Association de course à pied et de marche, LGBT et sympathisants, à Nice. Entraînements le mercredi à 19h30 et le dimanche à 9h30 (8h30 en été), sur la Promenade des Anglais.$db2a29100$, 1000),
  description_i18n = $ib2a29100${"fr": "Association de course à pied et de marche, LGBT et sympathisants, à Nice. Entraînements le mercredi à 19h30 et le dimanche à 9h30 (8h30 en été), sur la Promenade des Anglais.", "en": "LGBT running and walking group, also open to supporters, in Nice. Sessions on Wednesday at 7:30 pm and Sunday at 9:30 am (8:30 am in summer), on the Promenade des Anglais.", "es": "Asociación de running y marcha, LGBT y simpatizantes, en Niza. Entrenamientos los miércoles a las 19:30 y los domingos a las 9:30 (8:30 en verano), en la Promenade des Anglais.", "de": "LGBT-Lauf- und Wandergruppe, auch offen für Unterstützer, in Nizza. Training mittwochs um 19:30 Uhr und sonntags um 9:30 Uhr (im Sommer 8:30 Uhr), auf der Promenade des Anglais.", "it": "Associazione di corsa e camminata, LGBT e simpatizzanti, a Nizza. Allenamenti il mercoledì alle 19:30 e la domenica alle 9:30 (8:30 in estate), sulla Promenade des Anglais.", "pt": "Associação de corrida e marcha, LGBT e simpatizantes, em Nice. Treinos à quarta às 19h30 e ao domingo às 9h30 (8h30 no verão), na Promenade des Anglais.", "ar": "جمعية للجري والمشي، للمثليين والمتعاطفين، في نيس. التدريبات يوم الأربعاء الساعة 19:30 ويوم الأحد الساعة 9:30 (8:30 في الصيف)، على ممر الإنجليز."}$ib2a29100$::jsonb,
  hours = $hrs$mercredi 19h30 ; dimanche 9h30 (8h30 en été)$hrs$,
  website = $web$http://www.frontrunnersnice.org$web$
where id = 'b2a29100-f8c8-4d2c-a9c1-d075378696a0';


update hdar.places set
  kind = 'association',
  venue_kind = 'association',
  description = left($d512a133b$Association de course à pied LGBTI à Strasbourg. Entraînements le mardi à 19h30 et le samedi à 9h30, au parc de l'Orangerie.$d512a133b$, 1000),
  description_i18n = $i512a133b${"fr": "Association de course à pied LGBTI à Strasbourg. Entraînements le mardi à 19h30 et le samedi à 9h30, au parc de l'Orangerie.", "en": "LGBTI running club in Strasbourg. Training on Tuesday at 7:30 pm and Saturday at 9:30 am, at Parc de l'Orangerie.", "es": "Asociación de running LGBTI en Estrasburgo. Entrenamientos los martes a las 19:30 y los sábados a las 9:30, en el parque de l'Orangerie.", "de": "LGBTI-Laufverein in Straßburg. Training dienstags um 19:30 Uhr und samstags um 9:30 Uhr im Parc de l'Orangerie.", "it": "Associazione di corsa LGBTI a Strasburgo. Allenamenti il martedì alle 19:30 e il sabato alle 9:30, al Parc de l'Orangerie.", "pt": "Associação de corrida LGBTI em Estrasburgo. Treinos à terça às 19h30 e ao sábado às 9h30, no parque de l'Orangerie.", "ar": "جمعية للجري LGBTI في ستراسبورغ. التدريبات يوم الثلاثاء الساعة 19:30 ويوم السبت الساعة 9:30، في حديقة الأورانجيري."}$i512a133b$::jsonb,
  hours = $hrs$mardi 19h30 ; samedi 9h30$hrs$,
  website = website
where id = '512a133b-43b5-4713-a637-0c34fd03a0e1';


update hdar.places set
  kind = 'association',
  venue_kind = 'association',
  description = left($d289a8fe5$Association de football LGBT+ à Paris, fondée en 1997. Ouverte à tous les niveaux, avec des équipes féminines, masculines et mixtes.$d289a8fe5$, 1000),
  description_i18n = $i289a8fe5${"fr": "Association de football LGBT+ à Paris, fondée en 1997. Ouverte à tous les niveaux, avec des équipes féminines, masculines et mixtes.", "en": "LGBT+ football club in Paris, founded in 1997. Open to all levels, with women’s, men’s and mixed teams.", "es": "Asociación de fútbol LGBT+ en París, fundada en 1997. Abierta a todos los niveles, con equipos femeninos, masculinos y mixtos.", "de": "LGBT+-Fußballverein in Paris, gegründet 1997. Offen für alle Niveaus, mit Frauen-, Männer- und gemischten Teams.", "it": "Associazione di calcio LGBT+ a Parigi, fondata nel 1997. Aperta a tutti i livelli, con squadre femminili, maschili e miste.", "pt": "Associação de futebol LGBT+ em Paris, fundada em 1997. Aberta a todos os níveis, com equipas femininas, masculinas e mistas.", "ar": "جمعية كرة قدم LGBT+ في باريس، تأسست عام 1997. مفتوحة لجميع المستويات، مع فرق للنساء والرجال ومختلطة."}$i289a8fe5$::jsonb,
  hours = hours,
  website = $web$http://fcparisarcenciel.fr$web$
where id = '289a8fe5-8599-469e-ad8d-36ce709aafb9';


update hdar.places set
  kind = 'association',
  venue_kind = 'association',
  description = left($d0391af6c$Association parisienne de boxe française et de boxe anglaise, ouverte à toutes et tous. Plus de 230 adhérents, selon la Fédération Sportive LGBT+. Entraînements en semaine et le week-end, dans plusieurs gymnases parisiens.$d0391af6c$, 1000),
  description_i18n = $i0391af6c${"fr": "Association parisienne de boxe française et de boxe anglaise, ouverte à toutes et tous. Plus de 230 adhérents, selon la Fédération Sportive LGBT+. Entraînements en semaine et le week-end, dans plusieurs gymnases parisiens.", "en": "Paris association for French boxing and English boxing, open to everyone. More than 230 members, according to the Fédération Sportive LGBT+. Training on weekdays and at the weekend, in several Paris gyms.", "es": "Asociación parisina de boxeo francés y boxeo inglés, abierta a todas las personas. Más de 230 socios, según la Fédération Sportive LGBT+. Entrenamientos entre semana y el fin de semana, en varios gimnasios de París.", "de": "Pariser Verein für Savate (französisches Boxen) und Boxen, offen für alle. Mehr als 230 Mitglieder laut Fédération Sportive LGBT+. Training unter der Woche und am Wochenende in mehreren Pariser Turnhallen.", "it": "Associazione parigina di boxe francese e boxe inglese, aperta a tuttə. Oltre 230 iscritti, secondo la Fédération Sportive LGBT+. Allenamenti nei giorni feriali e nel weekend, in diverse palestre di Parigi.", "pt": "Associação parisiense de boxe francês e boxe inglês, aberta a todas as pessoas. Mais de 230 aderentes, segundo a Fédération Sportive LGBT+. Treinos durante a semana e no fim de semana, em vários pavilhões de Paris.", "ar": "جمعية باريسية للملاكمة الفرنسية والإنجليزية، مفتوحة للجميع. أكثر من 230 منتسباً، بحسب الاتحاد الرياضي LGBT+. التدريبات أيام الأسبوع وفي عطلة نهاية الأسبوع، في عدة قاعات بباريس."}$i0391af6c$::jsonb,
  hours = hours,
  website = $web$https://www.panameboxingclub.fr$web$
where id = '0391af6c-c1ef-4bd1-8930-c598e8705428';


update hdar.places set
  kind = 'association',
  venue_kind = 'association',
  description = left($d708d16fb$Club de cyclisme LGBTQIA+ et inclusif à Nice, ouvert aux allié·es et à tous les niveaux.$d708d16fb$, 1000),
  description_i18n = $i708d16fb${"fr": "Club de cyclisme LGBTQIA+ et inclusif à Nice, ouvert aux allié·es et à tous les niveaux.", "en": "LGBTQIA+ inclusive cycling club in Nice, open to allies and to all levels.", "es": "Club de ciclismo LGBTQIA+ e inclusivo en Niza, abierto a aliados y a todos los niveles.", "de": "Inklusiver LGBTQIA+-Radsportverein in Nizza, offen für Verbündete und alle Niveaus.", "it": "Club di ciclismo LGBTQIA+ e inclusivo a Nizza, aperto alle persone alleate e a tutti i livelli.", "pt": "Clube de ciclismo LGBTQIA+ e inclusivo em Nice, aberto a aliados e a todos os níveis.", "ar": "نادٍ للدراجات LGBTQIA+ وشامل في نيس، مفتوح للحلفاء ولجميع المستويات."}$i708d16fb$::jsonb,
  hours = hours,
  website = $web$https://visiblecyclingclub.com/fr$web$
where id = '708d16fb-117f-4f18-bae5-42119a3ff7b8';


update hdar.places set
  kind = 'association',
  venue_kind = 'association',
  description = left($dc8f2cf7e$Club de rugby inclusif à Paris, fondé en 2003 (loi 1901). Ouvert à tous les niveaux, âges et genres.$dc8f2cf7e$, 1000),
  description_i18n = $ic8f2cf7e${"fr": "Club de rugby inclusif à Paris, fondé en 2003 (loi 1901). Ouvert à tous les niveaux, âges et genres.", "en": "Inclusive rugby club in Paris, founded in 2003 (French law 1901 association). Open to all levels, ages and genders.", "es": "Club de rugby inclusivo en París, fundado en 2003 (ley 1901). Abierto a todos los niveles, edades y géneros.", "de": "Inklusiver Rugbyverein in Paris, gegründet 2003 (Verein nach dem Gesetz von 1901). Offen für alle Niveaus, Altersgruppen und Geschlechter.", "it": "Club di rugby inclusivo a Parigi, fondato nel 2003 (legge 1901). Aperto a tutti i livelli, età e generi.", "pt": "Clube de râguebi inclusivo em Paris, fundado em 2003 (lei de 1901). Aberto a todos os níveis, idades e géneros.", "ar": "نادٍ للرغبي شامل في باريس، تأسس عام 2003 (قانون 1901). مفتوح لجميع المستويات والأعمار والجندر."}$ic8f2cf7e$::jsonb,
  hours = hours,
  website = $web$https://www.lesgaillards.org$web$
where id = 'c8f2cf7e-e7ea-4804-847e-17d0765b0644';


update hdar.places set
  kind = 'association',
  venue_kind = 'association',
  description = left($dde6f3923$Club de rugby à XV inclusif et LGBT+ friendly à Paris. Entraînements le lundi de 19h à 20h30, le jeudi de 19h30 à 21h et le samedi de 10h à 12h.$dde6f3923$, 1000),
  description_i18n = $ide6f3923${"fr": "Club de rugby à XV inclusif et LGBT+ friendly à Paris. Entraînements le lundi de 19h à 20h30, le jeudi de 19h30 à 21h et le samedi de 10h à 12h.", "en": "Inclusive, LGBT+ friendly rugby union club in Paris. Training on Monday from 7 pm to 8:30 pm, Thursday from 7:30 pm to 9 pm, and Saturday from 10 am to 12 pm.", "es": "Club de rugby a XV inclusivo y LGBT+ friendly en París. Entrenamientos los lunes de 19:00 a 20:30, los jueves de 19:30 a 21:00 y los sábados de 10:00 a 12:00.", "de": "Inklusiver, LGBT+-freundlicher Rugby-Union-Verein in Paris. Training montags von 19 bis 20:30 Uhr, donnerstags von 19:30 bis 21 Uhr und samstags von 10 bis 12 Uhr.", "it": "Club di rugby a XV inclusivo e LGBT+ friendly a Parigi. Allenamenti il lunedì dalle 19 alle 20:30, il giovedì dalle 19:30 alle 21 e il sabato dalle 10 alle 12.", "pt": "Clube de râguebi de XV inclusivo e LGBT+ friendly em Paris. Treinos à segunda das 19h às 20h30, à quinta das 19h30 às 21h e ao sábado das 10h às 12h.", "ar": "نادٍ للرغبي الخماسي عشر شامل وصديق لـ LGBT+ في باريس. التدريبات الاثنين من 19 إلى 20:30، والخميس من 19:30 إلى 21، والسبت من 10 إلى 12."}$ide6f3923$::jsonb,
  hours = $hrs$lundi 19h–20h30, jeudi 19h30–21h, samedi 10h–12h$hrs$,
  website = $web$https://www.lescoqsfestifs.com$web$
where id = 'de6f3923-1e6a-4f8b-85bd-c4c3a5bdf46b';


update hdar.places set
  kind = 'sauna',
  venue_kind = 'sauna',
  description = left($d1b9aa90c$Sauna à Madrid, avec hammam et jacuzzi.$d1b9aa90c$, 1000),
  description_i18n = $i1b9aa90c${"fr": "Sauna à Madrid, avec hammam et jacuzzi.", "en": "Sauna in Madrid, with a hammam and jacuzzi.", "es": "Sauna en Madrid, con hammam y jacuzzi.", "de": "Sauna in Madrid, mit Hammam und Whirlpool.", "it": "Sauna a Madrid, con hammam e jacuzzi.", "pt": "Sauna em Madrid, com hammam e jacuzzi.", "ar": "ساونا في مدريد، مع حمّام وجاكوزي."}$i1b9aa90c$::jsonb,
  hours = hours,
  website = website
where id = '1b9aa90c-4297-4f5b-b4fd-3e1cd945b937';


update hdar.places set
  kind = 'bar',
  venue_kind = 'bar',
  description = left($d3c92ebc1$Café-théâtre à Paris, dans le 4e arrondissement (le Marais).$d3c92ebc1$, 1000),
  description_i18n = $i3c92ebc1${"fr": "Café-théâtre à Paris, dans le 4e arrondissement (le Marais).", "en": "Café-theatre in Paris, in the 4th arrondissement (the Marais).", "es": "Café-teatro en París, en el distrito 4 (el Marais).", "de": "Café-Theater in Paris, im 4. Arrondissement (das Marais).", "it": "Caffè-teatro a Parigi, nel 4° arrondissement (il Marais).", "pt": "Café-teatro em Paris, no 4.º arrondissement (o Marais).", "ar": "مقهى-مسرح في باريس، في الدائرة 4 (الماريه)."}$i3c92ebc1$::jsonb,
  hours = hours,
  website = $web$https://www.cdlg.org/j/$web$
where id = '3c92ebc1-e115-4387-93a6-2e8bae2e3acc';


update hdar.places set
  kind = 'club',
  venue_kind = 'club',
  description = left($d0f0fe4f9$Club queer du Marais à Paris, aussi appelé la Boîte à frissons.$d0f0fe4f9$, 1000),
  description_i18n = $i0f0fe4f9${"fr": "Club queer du Marais à Paris, aussi appelé la Boîte à frissons.", "en": "Queer club in the Marais, Paris, also known as la Boîte à frissons.", "es": "Club queer del Marais en París, también conocido como la Boîte à frissons.", "de": "Queerer Club im Marais in Paris, auch bekannt als la Boîte à frissons.", "it": "Club queer del Marais a Parigi, noto anche come la Boîte à frissons.", "pt": "Clube queer do Marais em Paris, também conhecido como la Boîte à frissons.", "ar": "نادٍ كوير في حي الماريه بباريس، يُعرف أيضاً باسم la Boîte à frissons."}$i0f0fe4f9$::jsonb,
  hours = hours,
  website = $web$https://tangoparis.com/$web$
where id = '0f0fe4f9-b1e5-4c13-9f8c-5091cca6e8d6';

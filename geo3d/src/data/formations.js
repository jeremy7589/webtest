// Formation metadata for the 21 layers of the OGIA 2017 Surat CMA geological model (Rev2B).
// Layer order (k = 1 at the surface) follows zones_formations.txt shipped with the Petrel export.
// `color` is the display palette (close to the OGIA / GSQ convention, tuned for a dark UI),
// `ics` the CGMW/ICS chronostratigraphic hue, `hydro` the OGIA hydrostratigraphic class.

export const HYDRO = {
  cover: { label: 'Cenozoic cover (partial aquifer)', color: '#e9d96b' },
  regional: { label: 'Regional aquifer', color: '#2f86d6' },
  partial: { label: 'Partial / tight aquifer', color: '#7fbfe8' },
  interbedded: { label: 'Interbedded aquitard', color: '#8c8c8c' },
  tight: { label: 'Tight aquitard', color: '#55595f' },
  coal: { label: 'Coal measures (CSG target)', color: '#26262b' },
  basement: { label: 'Basement (for display)', color: '#6b4f45' },
}

export const FORMATIONS = [
  { k: 1,  name: 'Cenozoic',                    short: 'Cz',  color: '#f2d335', ics: '#e9d96b', hydro: 'cover',       group: 'Cenozoic cover', period: 'Cenozoic',
    age: 'Quaternary to Paleogene', lith: 'Condamine Alluvium, Main Range Volcanics basalt, Chinchilla Sand, Tertiary sediments', role: 'Shallow partial aquifer (Condamine Alluvium, basalts)' },
  { k: 2,  name: 'Upper Cretaceous',            short: 'Kgs', color: '#d4893a', ics: '#b7dc86', hydro: 'partial',     group: 'Rolling Downs Group', period: 'Cretaceous',
    age: 'Albian (Early Cretaceous)', lith: 'Griman Creek Formation and Surat Siltstone: lithic glauconitic sandstone, siltstone, mudstone', role: 'Minor aquifer / aquitard' },
  { k: 3,  name: 'Wallumbilla Formation',       short: 'Kw',  color: '#8dc63f', ics: '#8faf6e', hydro: 'tight',       group: 'Rolling Downs Group', period: 'Cretaceous',
    age: 'Aptian (~121 to 113 Ma)', lith: 'Marine mudstone and siltstone with calcareous concretions (Doncaster and Coreena members)', role: 'Regional aquitard: the main seal of the Great Artesian Basin' },
  { k: 4,  name: 'Bungil Formation',            short: 'Kb',  color: '#e6b04a', ics: '#a9d46c', hydro: 'partial',     group: 'Blythesdale Group', period: 'Cretaceous',
    age: 'Valanginian to Aptian', lith: 'Glauconitic sandstone, siltstone, mudstone (Nullawurt, Minmi, Kingull, Claravale members)', role: 'Partial aquifer' },
  { k: 5,  name: 'Mooga Sandstone',             short: 'Km',  color: '#a7b5b7', ics: '#c6e58c', hydro: 'regional',    group: 'Blythesdale Group', period: 'Cretaceous',
    age: 'Valanginian to Hauterivian', lith: 'Fine to medium sandstone, siltstone, mudstone', role: 'Aquifer (Cadna-owie Hooray equivalent)' },
  { k: 6,  name: 'Orallo Formation',            short: 'Ko',  color: '#8ea24d', ics: '#8db865', hydro: 'interbedded', group: 'Blythesdale Group', period: 'Cretaceous',
    age: 'Berriasian to Valanginian', lith: 'Sandstone, siltstone, mudstone, conglomerate, coal', role: 'Aquitard / minor discontinuous aquifer' },
  { k: 7,  name: 'Gubberamunda Sandstone',      short: 'JKg', color: '#6c7cb5', ics: '#5cc3c7', hydro: 'regional',    group: 'Blythesdale Group', period: 'Jurassic',
    age: 'Tithonian to Berriasian', lith: 'Medium to coarse quartzose sandstone, minor conglomerate and siltstone', role: 'Regional aquifer (GAB); best quality water in the Mimosa Syncline' },
  { k: 8,  name: 'Westbourne Formation',        short: 'Jwb', color: '#d94fa3', ics: '#4d8aa3', hydro: 'tight',       group: 'Injune Creek Group', period: 'Jurassic',
    age: 'Kimmeridgian to Tithonian', lith: 'Micaceous siltstone and mudstone, minor sandstone', role: 'Tight aquitard: most mudstone-rich unit of the Surat Basin' },
  { k: 9,  name: 'Springbok Sandstone',         short: 'Js',  color: '#e1a8d2', ics: '#82cfda', hydro: 'partial',     group: 'Injune Creek Group', period: 'Jurassic',
    age: 'Oxfordian to Kimmeridgian', lith: 'Labile sandstone, siltstone, mudstone, some coal', role: 'Tight aquifer, highly variable; first unit above the coal measures' },
  { k: 10, name: 'Walloon Coal Measures',       short: 'Jw',  color: '#d6c3a5', ics: '#2e4a5b', hydro: 'coal',        group: 'Injune Creek Group', period: 'Jurassic',
    age: 'Callovian to Oxfordian (U-Pb 162.6 to 158.9 Ma)', lith: 'Coal seams (about 9% of thickness) in siltstone, mudstone, sandstone: Juandah, Tangalooma, Taroom units', role: 'Coal seam gas target; interbedded (leaky) aquitard' },
  { k: 11, name: 'Durabilla Formation',         short: 'Jd',  color: '#6f4a39', ics: '#5f8294', hydro: 'tight',       group: 'Injune Creek Group', period: 'Jurassic',
    age: 'Bajocian to Bathonian', lith: 'Eurombah Formation: clayey sandstone, siltstone, mudstone, almost no coal', role: 'Aquitard separating the Hutton from the coal measures' },
  { k: 12, name: 'Hutton Sandstone',            short: 'Jh',  color: '#2bb5b4', ics: '#43aed1', hydro: 'regional',    group: 'Bundamba Group', period: 'Jurassic',
    age: 'Toarcian to Bajocian', lith: 'Quartzose sandstone at the top, feldspathic sublabile sandstone at the base, minor siltstone', role: 'Major aquifer (GAB): first major aquifer below the coal measures' },
  { k: 13, name: 'Upper Evergreen Formation',   short: 'Jeu', color: '#3f7f4f', ics: '#5f8ca8', hydro: 'tight',       group: 'Bundamba Group', period: 'Jurassic',
    age: 'Pliensbachian to Toarcian', lith: 'Mudstone, siltstone, fine sandstone (Westgrove Ironstone Member)', role: 'Aquitard' },
  { k: 14, name: 'Boxvale Sandstone Member',    short: 'Jeb', color: '#bfe5f0', ics: '#9fd4e7', hydro: 'partial',     group: 'Bundamba Group', period: 'Jurassic',
    age: 'Pliensbachian', lith: 'Fine to medium quartzose sandstone', role: 'Thin local aquifer inside the Evergreen aquitard' },
  { k: 15, name: 'Lower Evergreen Formation',   short: 'Jel', color: '#7fb069', ics: '#4f7b95', hydro: 'tight',       group: 'Bundamba Group', period: 'Jurassic',
    age: 'Pliensbachian', lith: 'Mudstone, siltstone, sandstone, minor coal', role: 'Aquitard isolating the Precipice from the Hutton' },
  { k: 16, name: 'Precipice Sandstone',         short: 'Jp',  color: '#2fc3ef', ics: '#1f78b4', hydro: 'regional',    group: 'Bundamba Group', period: 'Jurassic',
    age: 'Hettangian to Sinemurian (~199 to 187 Ma)', lith: 'Porous quartz-rich sandstone deposited by braided streams', role: 'Regional aquifer (basal Surat); used for CSG water reinjection' },
  { k: 17, name: 'Moolayember Formation',       short: 'Rm',  color: '#5b8a52', ics: '#b069b2', hydro: 'tight',       group: 'Bowen Basin', period: 'Triassic',
    age: 'Anisian to Ladinian (Middle Triassic)', lith: 'Micaceous lithic sandstone and siltstone', role: 'Aquitard at the top of the Bowen Basin' },
  { k: 18, name: 'Clematis Sandstone',          short: 'Rc',  color: '#b4a3d8', ics: '#cb9ed2', hydro: 'regional',    group: 'Bowen Basin', period: 'Triassic',
    age: 'Olenekian to Anisian', lith: 'Clematis Group: quartzose to sublabile micaceous sandstone, conglomerate', role: 'Aquifer' },
  { k: 19, name: 'Rewan Group',                 short: 'Rr',  color: '#d9546b', ics: '#8c4a9e', hydro: 'tight',       group: 'Bowen Basin', period: 'Triassic',
    age: 'Induan to Olenekian (Early Triassic)', lith: 'Lithic sandstone, green to reddish brown mudstone, volcanilithic conglomerate', role: 'Regional aquitard sealing the Permian coal measures' },
  { k: 20, name: 'Bandanna Formation',          short: 'Pb',  color: '#3b4a6b', ics: '#b5452f', hydro: 'coal',        group: 'Bowen Basin', period: 'Permian',
    age: 'Lopingian (Late Permian)', lith: 'Blackwater Group coal measures: lithic sandstone, carbonaceous mudstone, coal, ashstone', role: 'Coal seam gas target of the Bowen Basin; interbedded aquitard' },
  { k: 21, name: 'Undivided lower Bowen Basin', short: 'Pl',  color: '#e8a33d', ics: '#d08e7e', hydro: 'basement',    group: 'Bowen Basin', period: 'Permian',
    age: 'Permian', lith: 'Black Alley Shale, Back Creek Group, Cattle Creek Formation and older units down to the model base', role: 'Mostly aquitard; treated as basement of the groundwater system' },
]

export const byK = Object.fromEntries(FORMATIONS.map(f => [f.k, f]))

export const PERIOD_COLORS = {
  Cenozoic: '#e9d96b', Cretaceous: '#8fc96c', Jurassic: '#43aed1', Triassic: '#a56bb0', Permian: '#d2634c',
}

export const PALETTES = {
  formation: { label: 'Formation', color: (f) => f.color },
  age: { label: 'Age', color: (f) => f.ics },
  hydro: { label: 'Hydro role', color: (f) => HYDRO[f.hydro].color },
}

// Towns for orientation (WGS84 lon/lat), converted to MGA55 at runtime.
export const TOWNS = [
  { name: 'Roma', lon: 148.787, lat: -26.567, major: true },
  { name: 'Dalby', lon: 151.263, lat: -27.182, major: true },
  { name: 'Toowoomba', lon: 151.954, lat: -27.561, major: true },
  { name: 'Chinchilla', lon: 150.627, lat: -26.738, major: true },
  { name: 'Miles', lon: 150.187, lat: -26.658 },
  { name: 'Taroom', lon: 149.797, lat: -25.640 },
  { name: 'Injune', lon: 148.564, lat: -25.840 },
  { name: 'Surat', lon: 149.066, lat: -27.153 },
  { name: 'St George', lon: 148.580, lat: -28.036, major: true },
  { name: 'Goondiwindi', lon: 150.306, lat: -28.547, major: true },
  { name: 'Wandoan', lon: 149.960, lat: -26.123 },
  { name: 'Mitchell', lon: 147.975, lat: -26.488 },
  { name: 'Kingaroy', lon: 151.838, lat: -26.541 },
  { name: 'Theodore', lon: 150.075, lat: -24.948 },
  { name: 'Moura', lon: 149.970, lat: -24.580 },
  { name: 'Rolleston', lon: 148.627, lat: -24.464 },
  { name: 'Emerald', lon: 148.160, lat: -23.527, major: true },
  { name: 'Springsure', lon: 148.091, lat: -24.118 },
  { name: 'Warwick', lon: 152.034, lat: -28.218 },
  { name: 'Moonie', lon: 150.370, lat: -27.717 },
]

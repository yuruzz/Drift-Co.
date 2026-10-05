// Drift & Co. — Official Fragrance Catalog Data
// 30% Fragrance Oil, US & Germany imported formulations
// Alphabetically ordered (A to Z)
// Sizes: 40ml (₱380.00) & 50ml (₱450.00)

const STANDARD_PERFUME_SIZES = [
    { volume: "40ml", price: 380 },
    { volume: "50ml", price: 550 }
];

const products = [
    {
        id: 11,
        name: "Amethyste",
        inspiration: "Bvlgari Omnia",
        gender: "Women",
        category: "floral",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Amethyste.jfif",
        description: "An aristocratic, velvety powdery floral inspired by the violet hues of the amethyst gemstone. Delicate morning sap, Florentine iris, and silky heliotrope.",
        topNotes: "Green Sap, Shimmering Pink Grapefruit",
        heartNotes: "Noble Iris Concrete, Bulgarian Rosebud",
        baseNotes: "Heliotrope, Solar Wood Notes, Velvety Musk"
    },
    {
        id: 3,
        name: "Aventus",
        inspiration: "Creed",
        gender: "Men",
        category: "citrus",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Aventus.jfif",
        description: "A celebrated, magnetic masterpiece opening with ripe royal pineapple and blackcurrant before drying down into smoky French birch and velvety ambergris.",
        topNotes: "Royal Pineapple, Bergamot, Black Currant, Crisp Apple",
        heartNotes: "Dry Birch, Moroccan Jasmine, Patchouli, Damask Rose",
        baseNotes: "Oakmoss, Ambergris, Bourbon Vanilla, Sensual Musk"
    },
    {
        id: 18,
        name: "Baccarat Rouge",
        inspiration: "Maison Francis Kurkdjian 540",
        gender: "Unisex",
        category: "woody",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Baccarat_Rouge.jfif",
        description: "A transcendent, crystalline alchemy of golden saffron, luminous jasmine petals, mineral ambergris, and warm freshly cut cedarwood resin.",
        topNotes: "Golden Saffron, Moroccan Jasmine",
        heartNotes: "Amberwood, Warm Ambergris Accord",
        baseNotes: "Fir Balsam Resin, Virginian Cedar"
    },
    {
        id: 9,
        name: "Be Delicious",
        inspiration: "DKNY",
        gender: "Women",
        category: "citrus",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Be_Delicious.jfif",
        description: "An intoxicatingly crisp and juicy New York signature celebrating tart American green apple, dewy garden cucumber, and opulent white tuberose.",
        topNotes: "Crisp Cucumber, Pink Grapefruit, Magnolia",
        heartNotes: "Green Apple, Lily-of-the-Valley, Tuberose, Violet, Rose",
        baseNotes: "Blonde Woods, Sandalwood, Golden Amber"
    },
    {
        id: 17,
        name: "Black Opium",
        inspiration: "Yves Saint Laurent",
        gender: "Women",
        category: "vanilla",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Black_Opium.jfif",
        description: "An intensely addictive, sensual collision of dark roast black coffee beans, luminous white orange blossoms, and sweet intoxicating bourbon vanilla.",
        topNotes: "Anjou Pear, Pink Pepper, Orange Blossom",
        heartNotes: "Dark Roast Coffee, Jasmine, Bitter Almond, Licorice",
        baseNotes: "Bourbon Vanilla, Indonesian Patchouli, Cedar, Cashmere Wood"
    },
    {
        id: 15,
        name: "Bombshell",
        inspiration: "Victoria's Secret",
        gender: "Women",
        category: "fruity",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Bombshell.jfif",
        description: "The quintessential glamorous fruit-floral sensation. Juicy purple passionfruit and Shangri-La yellow peony combine with sun-drenched Italian pine.",
        topNotes: "Passionfruit, Grapefruit, Pineapple, Tangerine, Wild Strawberry",
        heartNotes: "Shangri-La Peony, Vanilla Orchid, Red Berries, Jasmine",
        baseNotes: "Sensual Musk, Blonde Woods, Oakmoss"
    },
    {
        id: 7,
        name: "Cool Water for Men",
        inspiration: "Davidoff",
        gender: "Men",
        category: "aromatic",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Cool_Water_Men.jfif",
        description: "The definitive ocean icon: sharp peppermint, bracing sea water accords, aromatic rosemary, and rich oakmoss crafted for revitalizing masculine charm.",
        topNotes: "Sea Breeze Water, Crisp Peppermint, Lavender, Rosemary",
        heartNotes: "Sandalwood, Jasmine, Neroli, Mountain Geranium",
        baseNotes: "White Musk, Forest Oakmoss, Virginian Cedar, Warm Amber"
    },
    {
        id: 8,
        name: "Cool Water for Women",
        inspiration: "Davidoff",
        gender: "Women",
        category: "aromatic",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Cool_Water.jfif",
        description: "A tranquil aquatic floral evoking dewy lake blossoms, juicy honeydew melon, sheer lotus petals, and fresh blackberry woods.",
        topNotes: "Honeydew Melon, Lotus Petals, Lemon, Pineapple, Quince",
        heartNotes: "Water Lily, Lily-of-the-Valley, Jasmine, Wild Honey, Rose",
        baseNotes: "Vetiver, Wild Blackberry, Sandalwood, Soft Vanilla"
    },
    {
        id: 20,
        name: "Envy Me",
        inspiration: "Gucci",
        gender: "Women",
        category: "fruity",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Envy_Me.jfif",
        description: "A seductive, irresistible temptation radiating juicy pink litchi, ruby pomegranate, seductive pink peonies, and warm white teak woods.",
        topNotes: "Pink Peony, Pink Pepper, Pineapple, Jasmine, Mango, Cassia",
        heartNotes: "Juicy Litchi, Pomegranate, Rose Water, White Tea",
        baseNotes: "Teak Wood, Mysore Sandalwood, Tonka Bean, Sensual Musk"
    },
    {
        id: 4,
        name: "Essential",
        inspiration: "Lacoste",
        gender: "Men",
        category: "aromatic",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Essential.jfif",
        description: "A liberating, ultra-refreshing blend defined by rare aromatic tomato leaves, citrus sunshine, and fiery black pepper on warm Indonesian patchouli.",
        topNotes: "Crushed Tomato Leaf, Tangerine, Bergamot, Cassia",
        heartNotes: "Black Pepper, Soft Rose Water",
        baseNotes: "Mysore Sandalwood, Indonesian Patchouli"
    },
    {
        id: 2,
        name: "Extreme",
        inspiration: "Bvlgari",
        gender: "Men",
        category: "citrus",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Extreme.jfif",
        description: "A deeply distinguished, sparkling citrus accord harmonizing imperial Darjeeling tea with invigorating Mediterranean grapefruit, pepper, and smokey woods.",
        topNotes: "Darjeeling Tea, Grapefruit, Bergamot, Neroli, Petitgrain",
        heartNotes: "Balsam Fir, Guaiac Wood, Black Pepper, Nutmeg, Cardamom",
        baseNotes: "Crystal Musk, Cedar, Oakmoss, Sandalwood, Florentine Iris"
    },
    {
        id: 14,
        name: "Fantasy",
        inspiration: "Britney Spears",
        gender: "Women",
        category: "fruity",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Fantasy.jfif",
        description: "A seductive, playful gourmand love potion featuring exotic red litchi, golden quince, warm white chocolate cupcake accord, and sensual orris.",
        topNotes: "Red Litchi, Golden Quince, Exotic Kiwi",
        heartNotes: "White Chocolate, Cupcake Accord, Orchid, Jasmine",
        baseNotes: "Creamy Musk, Orris Root, Sensual Woodsy Notes"
    },
    {
        id: 5,
        name: "Happy for Men",
        inspiration: "Clinique",
        gender: "Men",
        category: "citrus",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Happy_Men.jfif",
        description: "Pure radiance and sunshine in a bottle, opening with uplifting ruby mandarin, kaffir lime, and crisp marine air layered over soft cedarwood.",
        topNotes: "Mandarin Orange, Lime, Ocean Mist, Lemon, Dewy Green Notes",
        heartNotes: "White Freesia, Jasmine, Lily-of-the-Valley, Dewy Rose",
        baseNotes: "Mediterranean Cypress, Cedar, Clean Musk, Guaiac Wood"
    },
    {
        id: 16,
        name: "Happy for Women",
        inspiration: "Clinique",
        gender: "Women",
        category: "citrus",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Happy_Women.jfif",
        description: "A vibrant, uplifting cascade of morning ruby grapefruit, Indian mandarin, and delicate spring mimosa florals that sparkles with cheerfulness.",
        topNotes: "Orange, Ruby Grapefruit, Indian Mandarin, Bergamot, Plum",
        heartNotes: "Lily-of-the-Valley, Freesia, Orchid, Dewy Rose",
        baseNotes: "Spring Mimosa, White Lily, Magnolia, Clean Musk"
    },
    {
        id: 12,
        name: "Incanto Shine",
        inspiration: "Salvatore Ferragamo",
        gender: "Women",
        category: "fruity",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Incanto_Shine.jfif",
        description: "A joyful, radiant tropical paradise cocktail filled with ripe golden pineapple, passionfruit nectar, and sunlit pink peony blossoms.",
        topNotes: "Golden Pineapple, Passionfruit, Bergamot",
        heartNotes: "White Peach, Pink Peony, Freesia",
        baseNotes: "White Musk, Cedarwood, Warm Amber"
    },
    {
        id: 13,
        name: "Meow",
        inspiration: "Katy Perry",
        gender: "Women",
        category: "vanilla",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Meow.jfif",
        description: "A sweet, whimsical confection blending velvety pear nectar, tangerine zest, white gardenia, and a decadent base of whipped vanilla and amber.",
        topNotes: "Sweet Pear, Tangerine, Gardenia, Jasmine Petals",
        heartNotes: "Honeysuckle, African Orange Flower, Lily-of-the-Valley",
        baseNotes: "Whipped Vanilla, Golden Amber, Musk, Sandalwood"
    },
    {
        id: 1,
        name: "Polosport",
        inspiration: "Ralph Lauren",
        gender: "Men",
        category: "aromatic",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Polosport.jfif",
        description: "An invigorating, clean aromatic-aquatic burst combining chilled wild mint, sparkling aldehydes, and maritime notes underpinned by masculine cedarwood.",
        topNotes: "Mint, Aldehydes, Lavender, Bergamot, Mandarin Orange, Lemon",
        heartNotes: "Seagrass, Ginger, Jasmine, Geranium, Brazilian Rosewood",
        baseNotes: "Musk, Sandalwood, Cedar, Guaiac Wood, Clean Amber"
    },
    {
        id: 10,
        name: "Tommy Girl",
        inspiration: "Tommy Hilfiger",
        gender: "Women",
        category: "citrus",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Tommy_Girl.jfif",
        description: "An effervescent bouquet of wild American apple blossoms, tart blackcurrant, sun-drenched lemons, and fresh honeysuckle flower petals.",
        topNotes: "Apple Blossom, Camellia, Mandarin Orange, Black Currant",
        heartNotes: "Lemon, Wild Honeysuckle, Rose, Grapefruit, Lily, Mint",
        baseNotes: "White Magnolia, Jasmine, Cedar, Light Leather"
    },
    {
        id: 6,
        name: "Weekend for Men",
        inspiration: "Burberry",
        gender: "Men",
        category: "citrus",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Weekend_Men.jfif",
        description: "A relaxed, casually elegant fragrance capturing bright weekend country mornings with juicy lemon, sweet honeydew, ivy leaf, and warm amber honey.",
        topNotes: "Lemon, Grapefruit, Bergamot, Pineapple, Mandarin Orange",
        heartNotes: "English Ivy, Forest Oakmoss, Sandalwood",
        baseNotes: "Golden Honey, Sensual Musk, Warm Amber"
    },
    {
        id: 19,
        name: "Weekend for Women",
        inspiration: "Burberry",
        gender: "Women",
        category: "floral",
        volume: "40ml",
        price: 380,
        sizes: STANDARD_PERFUME_SIZES,
        image: "/perfumes/Weekend.jfif",
        description: "A comforting, powdery floral capturing tranquil countryside picnics with juicy sweet nectarines, blue hyacinth blossoms, and soft cedarwood.",
        topNotes: "Mignonette, Zesty Mandarin Orange, Clary Sage",
        heartNotes: "Sweet Nectarine, Blue Hyacinth, Peach Blossom, Rose Hip, Iris",
        baseNotes: "Creamy Musk, Mysore Sandalwood, Cedar"
    }
];

if (typeof window !== 'undefined') {
    window.products = products;
    window.STANDARD_PERFUME_SIZES = STANDARD_PERFUME_SIZES;
}

// Default product images dictionary (allows easy reset)
const defaultProductImages = {};
products.forEach(function(p) {
    defaultProductImages[p.id] = p.image;
});

if (typeof window !== 'undefined') {
    window.defaultProductImages = defaultProductImages;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { products, STANDARD_PERFUME_SIZES, defaultProductImages };
}


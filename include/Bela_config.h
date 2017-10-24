//#define CODEC_TLV320
//#define CTAG_FACE_8CH
#define CTAG_BEAST_16CH

#if defined(CTAG_FACE_8CH) || defined(CTAG_BEAST_16CH)
#define CODEC_AD1938
#endif

#if ((defined(CTAG_FACE_8CH) + defined(CODEC_TLV320) + defined(CTAG_BEAST_16CH)) != 1)
#error you need to select one codec
#endif


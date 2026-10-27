// expand.c : expand an Eclipse ASCII keyword block (with n*v repeat counts)
// into a raw binary array. Usage: expand <in.GRDECL> <KEYWORD> <out.bin> <f32|f64>
// Skips '--' comments, finds the keyword, reads values until the terminating '/'.
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <ctype.h>

#define BUF (1 << 24)

int main(int argc, char **argv) {
    if (argc != 5) { fprintf(stderr, "usage: expand in kw out f32|f64\n"); return 2; }
    FILE *in = fopen(argv[1], "rb"); if (!in) { perror("in"); return 1; }
    FILE *out = fopen(argv[3], "wb"); if (!out) { perror("out"); return 1; }
    int f32 = strcmp(argv[4], "f32") == 0;
    const char *kw = argv[2]; size_t kwlen = strlen(kw);

    char *buf = malloc(BUF + 1);
    char tok[256]; int tl = 0;
    int in_comment = 0, found = 0, done = 0;
    long long nvals = 0;
    float *fo = malloc(sizeof(float) * (1 << 20)); double *dobuf = malloc(sizeof(double) * (1 << 20));
    size_t ofill = 0;

    #define FLUSH() do { if (f32) fwrite(fo, sizeof(float), ofill, out); else fwrite(dobuf, sizeof(double), ofill, out); ofill = 0; } while (0)
    #define EMIT(v) do { if (f32) fo[ofill++] = (float)(v); else dobuf[ofill++] = (v); if (ofill == (1 << 20)) FLUSH(); } while (0)

    size_t n;
    while (!done && (n = fread(buf, 1, BUF, in)) > 0) {
        for (size_t p = 0; p < n && !done; p++) {
            char c = buf[p];
            if (in_comment) { if (c == '\n') in_comment = 0; continue; }
            if (c == '-' && p + 1 < n && buf[p + 1] == '-') { in_comment = 1; p++; continue; }
            if (c == '-' && p + 1 == n) { // '-' at chunk edge: peek next chunk char
                int nc = fgetc(in); if (nc == '-') { in_comment = 1; continue; } if (nc != EOF) ungetc(nc, in);
            }
            int sep = isspace((unsigned char)c) || c == '/';
            if (!sep) { if (tl < 255) tok[tl++] = c; continue; }
            if (tl > 0) {
                tok[tl] = 0;
                if (!found) { if (strcmp(tok, kw) == 0) found = 1; }
                else {
                    char *star = strchr(tok, '*');
                    if (star) { *star = 0; long rep = atol(tok); double v = strtod(star + 1, NULL); for (long r = 0; r < rep; r++) EMIT(v); nvals += rep; }
                    else { double v = strtod(tok, NULL); EMIT(v); nvals++; }
                }
                tl = 0;
            }
            if (c == '/' && found) done = 1;
        }
    }
    FLUSH();
    fclose(out); fclose(in);
    fprintf(stderr, "%s: %lld values\n", kw, nvals);
    printf("%lld\n", nvals);
    return 0;
}

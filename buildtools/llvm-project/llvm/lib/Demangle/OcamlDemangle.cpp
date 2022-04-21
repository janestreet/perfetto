#include "llvm/Demangle/Demangle.h"

#include <cassert>
#include <cctype>
#include <cstring>
#include <cstdlib>

static unsigned int hex(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  return c - 'A' + 10;
}

namespace llvm {
  char* ocamlDemangle(const char *sym) {
    char *result;
    int j = 0;
    int i;

    int len = strlen(sym);

    assert(len >= 5);

    /* the demangled symbol is always smaller than the mangled symbol */
    result = (char*)std::malloc(len + 1);

    /* skip "caml" prefix */
    i = 4;

    while (i < len) {
      if (sym[i] == '_' && sym[i + 1] == '_') {
        /* "__" -> "." */
        result[j++] = '.';
        i += 2;
      }
      else if (sym[i] == '$' && isxdigit(sym[i + 1]) && isxdigit(sym[i + 2])) {
        /* "$xx" is a hex-encoded character */
        result[j++] = (hex(sym[i + 1]) << 4) | hex(sym[i + 2]);
        i += 3;
      }
      else {
        result[j++] = sym[i++];
      }
    }
    result[j] = '\0';

    /* scan backwards to remove an "_" followed by decimal digits */
    if (j != 0 && isdigit(result[j - 1])) {
      while (--j) {
        if (!isdigit(result[j])) {
          break;
        }
      }
      if (result[j] == '_') {
        result[j] = '\0';
      }
    }

    return result;
}
}
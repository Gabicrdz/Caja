/**
 * Un error "esperado", con un mensaje pensado para la persona que usa la caja
 * (por ejemplo: "Ya hay una categoría con ese nombre"). Los demás errores son
 * fallas del programa: se registran en la consola y la ventana recibe un
 * mensaje genérico.
 */
export class ErrorDeUsuario extends Error {
  constructor(mensaje: string) {
    super(mensaje);
    this.name = 'ErrorDeUsuario';
  }
}

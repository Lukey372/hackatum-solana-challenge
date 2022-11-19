import 'package:flutter_bloc/flutter_bloc.dart';

import 'application_event.dart';
import 'application_state.dart';

class ApplicationBloc extends Bloc<ApplicationEvent, ApplicationState> {

  int amountSolami =0;
  int amountMargherita = 0;

  int priceSolami = 5;
  int priceMargherita = 3;

  ApplicationBloc() : super(ApplicationStartState()) {
    on<ApplicationInitialStartEvent>(
        (event, emit) => emit(ApplicationStartState()));

  }

  void incrementSolami() {
    amountSolami++;
  }
  void decrementSolami() {
    amountSolami >0 ? amountSolami-- : amountSolami;
  }
  void incrementMargherita() {
    amountMargherita++;
  }
  void decrementMargherita() {
    amountMargherita >0 ? amountMargherita-- : amountMargherita;
  }

  int getTotalPrice() {
    return (amountSolami * priceSolami) + (amountMargherita * priceMargherita);
  }

}

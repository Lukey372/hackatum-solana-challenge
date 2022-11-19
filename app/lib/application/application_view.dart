import 'package:cached_network_image/cached_network_image.dart';
import 'package:flutter/cupertino.dart';
import 'package:flutter/material.dart';
import 'package:flutter_bloc/flutter_bloc.dart';
import 'package:pizzeria_del_sol/corporate_design.dart';
import 'package:qr_flutter/qr_flutter.dart';

import 'application_bloc.dart';

class ApplicationView extends StatefulWidget {



  const ApplicationView({Key? key}) : super(key: key);

  @override
  State<ApplicationView> createState() => _ApplicationViewState();
}

class _ApplicationViewState extends State<ApplicationView> {
  @override
  Widget build(BuildContext context) {
    ApplicationBloc bloc = BlocProvider.of<ApplicationBloc>(context);

    int totalPrice = bloc.getTotalPrice();



    return Container(
      color: Color.fromRGBO(0xff, 0xe2, 0x85, 1.0),
        child: Padding(
          padding: const EdgeInsets.all(50.0),
          child: Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              crossAxisAlignment: CrossAxisAlignment.center,
              children: [
                Expanded(
                  flex: 3,
                  child: Image.asset("assets/pizzeria-logo.png"),
                ),
                Expanded(
                  flex: 5,
                  child: Row(
                    children: [
                      Expanded(child: getPizzaSolami(bloc)),
                      Expanded(child: getPizzaMargherita(bloc))
                    ],
                  ),
                ),
                Expanded(
                  flex: 3,
                    child: Column(
                      mainAxisAlignment: MainAxisAlignment.center,
                      children: [
                        Text("Total: \n $totalPrice PizzaToken", style: CorporateDesign.bigStyle, textAlign: TextAlign.center,),
                        CupertinoButton(child: Text("Done", style: CorporateDesign.bigButtonStyle,), onPressed: totalPrice == 0 ? null : () {
                          showCupertinoModalPopup(context: context, builder: (BuildContext context) => Container(
                            decoration: BoxDecoration(
                                borderRadius: BorderRadius.circular(50),
                              color: Colors.white
                            ),
                            height: MediaQuery.of(context).size.height*0.6,
                            width: MediaQuery.of(context).size.width,
                            child: Center(
                                child: QrImage(
                                  data: "solana:https://select-pizzapay-niclasschuemann.vercel.app/api/user",
                                  version: QrVersions.auto,
                                  size: 300.0,
                                ),
                            ),
                          ));
                        },
                          disabledColor: CupertinoColors.inactiveGray,
                        )
                      ],
                    ))
              ],
            ),
          ),
        ));
  }

  Widget getPizza(String image, int price, int amountPizza, Function onIncrement, Function onDecrement) {
    return Column(
      children: [
        Image.asset(image),
        Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
          CupertinoButton(child: const Text("-", style: CorporateDesign.buttonStyle,), onPressed: () {
            onDecrement.call();
            setState(() {});
          }),
          Text(amountPizza.toString(), style: CorporateDesign.normalStyle,),
          CupertinoButton(child: Text("+", style: CorporateDesign.buttonStyle,), onPressed: () {
            onIncrement.call();
            setState(() {});
          }),

        ],),
        Text("$price PizzaToken")
      ],
    );
  }

  Widget getPizzaSolami(ApplicationBloc bloc) {
    return getPizza("assets/solami.png", bloc.priceSolami, bloc.amountSolami, bloc.incrementSolami, bloc.decrementSolami);
  }
  Widget getPizzaMargherita(ApplicationBloc bloc) {
    return getPizza("assets/margherita.png", bloc.priceMargherita, bloc.amountMargherita, bloc.incrementMargherita, bloc.decrementMargherita);
  }
}

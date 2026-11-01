import 'package:flutter/material.dart';
import '../widgets/glass.dart';

class ComingSoon extends StatelessWidget {
  const ComingSoon(this.title, {super.key});
  final String title;
  @override
  Widget build(BuildContext context) => ListView(children: [PageHead(title: title, sub: 'Bu modül aktarılıyor')]);
}

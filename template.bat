cd .\jre
.\jre\bin\java -cp avctKVM.jar -Djava.library.path=.\lib com.avocent.idrac.kvm.Main {{ args | safe }}
pause